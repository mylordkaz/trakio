import type { Device } from 'react-native-ble-plx';
import type {
  TelemetrySource,
  TelemetrySourceCallbacks,
  SourceConnectionState,
} from '@/telemetry/sources/types';
import {
  connectToDevice,
  subscribeToCharacteristic,
  disconnectDevice,
  writeCharacteristic,
  readCharacteristicBytes,
} from '@/telemetry/sources/ble-transport';
import { createPacketBuffer } from '@/telemetry/sources/ubx/packet-buffer';
import {
  NAV_CLASS,
  NAV_PVT_ID,
  ACK_CLASS,
  CFG_CLASS,
  CFG_VALGET_ID,
} from '@/telemetry/sources/ubx/constants';
import { resolveDragyModel } from '@/telemetry/sources/device-classifier';
import { buildHandshakeResponse, isHandshakeConfirmed } from '@/telemetry/sources/dragy/handshake';
import {
  decodeNavPvt,
  navPvtToSample,
  isPerformanceModeReply,
  decodeMeasurementPeriodReply,
} from '@/telemetry/sources/dragy/parser';
import {
  encodePerformanceModeQuery,
  encodeFourGnssConfig,
  encodeRateQuery,
  encodeRateConfig,
} from '@/telemetry/sources/dragy/packet-writer';
import {
  DRAGY_SERVICE_UUID,
  DRAGY_COMMAND_CHARACTERISTIC_UUID,
  DRAGY_STREAM_CHARACTERISTIC_UUID,
  DRAGY_HANDSHAKE_CHARACTERISTIC_UUID,
  DRAGY_BATTERY_CHARACTERISTIC_UUID,
  CONFIG_RESPONSE_TIMEOUT_MS,
  STREAM_PROBE_TIMEOUT_MS,
  BATTERY_POLL_INTERVAL_MS,
  MAX_BATTERY_PERCENT,
  TARGET_MEAS_PERIOD_MS,
} from '@/telemetry/sources/dragy/constants';

type ConfigReply = { messageClass: number; messageId: number; payload: Uint8Array };

export function createDragySource(deviceId: string, deviceName: string): TelemetrySource {
  const model = resolveDragyModel(deviceName);

  let connectionState: SourceConnectionState = 'disconnected';
  let bleSubscription: { remove: () => void } | null = null;
  let packetBuffer: ReturnType<typeof createPacketBuffer> | null = null;
  let batteryTimer: ReturnType<typeof setInterval> | null = null;
  let batteryLevel: number | null = null;
  let pendingConfigReply: ((reply: ConfigReply) => void) | null = null;
  // Rejects a pending start(); the lifecycle ignores 'disconnected' before switchover.
  let abortLink: ((error: Error) => void) | null = null;

  function teardown(): void {
    if (batteryTimer !== null) {
      clearInterval(batteryTimer);
      batteryTimer = null;
    }
    pendingConfigReply = null;
    bleSubscription?.remove();
    bleSubscription = null;
    packetBuffer?.reset();
    packetBuffer = null;
  }

  async function readBattery(device: Device): Promise<void> {
    try {
      const bytes = await readCharacteristicBytes(
        device,
        DRAGY_SERVICE_UUID,
        DRAGY_BATTERY_CHARACTERISTIC_UUID
      );
      if (bytes && bytes.length >= 2 && bytes[1] <= MAX_BATTERY_PERCENT) {
        batteryLevel = bytes[1];
      }
    } catch {
      // Battery is informational; the stream does not depend on it.
    }
  }

  // The read-back is the vendor's success signal, but the stream is the proof:
  // a rejected handshake leaves fd02 silent and the probe below fails the start.
  async function performHandshake(
    device: Device,
    callbacks: TelemetrySourceCallbacks
  ): Promise<void> {
    const challenge = await readCharacteristicBytes(
      device,
      DRAGY_SERVICE_UUID,
      DRAGY_HANDSHAKE_CHARACTERISTIC_UUID
    );
    const response = challenge ? buildHandshakeResponse(challenge) : null;
    if (!response) {
      throw new Error('Dragy handshake challenge missing');
    }

    await writeCharacteristic(
      device,
      DRAGY_SERVICE_UUID,
      DRAGY_HANDSHAKE_CHARACTERISTIC_UUID,
      response
    );

    const readback = await readCharacteristicBytes(
      device,
      DRAGY_SERVICE_UUID,
      DRAGY_HANDSHAKE_CHARACTERISTIC_UUID
    ).catch(() => null);
    if (!isHandshakeConfirmed(response, readback)) {
      callbacks.onError(new Error('Dragy handshake not confirmed on read-back'));
    }
  }

  function awaitConfigReply(linkLost: Promise<never>): Promise<ConfigReply | null> {
    const reply = new Promise<ConfigReply | null>((resolve) => {
      const timeout = setTimeout(() => {
        pendingConfigReply = null;
        resolve(null);
      }, CONFIG_RESPONSE_TIMEOUT_MS);

      pendingConfigReply = (value) => {
        clearTimeout(timeout);
        pendingConfigReply = null;
        resolve(value);
      };
    });
    return Promise.race([linkLost, reply]);
  }

  async function writeCommand(device: Device, packet: Uint8Array): Promise<boolean> {
    try {
      await writeCharacteristic(
        device,
        DRAGY_SERVICE_UUID,
        DRAGY_COMMAND_CHARACTERISTIC_UUID,
        packet
      );
      return true;
    } catch {
      return false;
    }
  }

  // Four-GNSS and the 25 Hz rate are only honoured in Performance Mode, which
  // the vendor detects with a proprietary VALGET. The vendor asks for Four-GNSS
  // on every connection; the rate is only written when it differs. A device
  // outside Performance Mode streams at its default and is left untouched.
  async function applyTrackConfig(device: Device, linkLost: Promise<never>): Promise<void> {
    if (!(await writeCommand(device, encodePerformanceModeQuery()))) {
      return;
    }
    const modeReply = await awaitConfigReply(linkLost);
    const performanceMode =
      modeReply !== null &&
      modeReply.messageClass === CFG_CLASS &&
      modeReply.messageId === CFG_VALGET_ID &&
      isPerformanceModeReply(modeReply.payload);
    if (!performanceMode) {
      return;
    }

    if (!(await writeCommand(device, encodeFourGnssConfig()))) {
      return;
    }
    await awaitConfigReply(linkLost);

    if (!(await writeCommand(device, encodeRateQuery()))) {
      return;
    }
    const rateReply = await awaitConfigReply(linkLost);
    const currentPeriod =
      rateReply !== null &&
      rateReply.messageClass === CFG_CLASS &&
      rateReply.messageId === CFG_VALGET_ID
        ? decodeMeasurementPeriodReply(rateReply.payload)
        : null;
    if (currentPeriod === TARGET_MEAS_PERIOD_MS) {
      return;
    }

    if (!(await writeCommand(device, encodeRateConfig(TARGET_MEAS_PERIOD_MS)))) {
      return;
    }
    await awaitConfigReply(linkLost);
  }

  return {
    sourceType: 'dragy',

    async start(callbacks: TelemetrySourceCallbacks) {
      connectionState = 'connecting';
      callbacks.onStateChange('connecting');

      const device = await connectToDevice(deviceId);

      let rejectLink: (error: Error) => void = () => undefined;
      const linkLost = new Promise<never>((_, reject) => {
        rejectLink = reject;
      });
      // Only awaited inside the races below; a late rejection must not surface as unhandled.
      linkLost.catch(() => undefined);
      abortLink = rejectLink;

      let connected = false;
      let streamSeen = false;
      let resolveStreamSeen: () => void = () => undefined;
      const streamSeenPromise = new Promise<void>((resolve) => {
        resolveStreamSeen = resolve;
      });
      let probeTimeout: ReturnType<typeof setTimeout> | null = null;

      try {
        if (model !== 'drglt') {
          await performHandshake(device, callbacks);
        }
        await readBattery(device);

        packetBuffer = createPacketBuffer({
          onPacket: (messageClass, messageId, payload) => {
            if (messageClass === NAV_CLASS && messageId === NAV_PVT_ID) {
              const raw = decodeNavPvt(payload);
              if (!raw) {
                return;
              }

              callbacks.onActivity();

              if (!connected) {
                // Emitting the probing frame would race the lifecycle's switchover.
                streamSeen = true;
                resolveStreamSeen();
                return;
              }

              const sample = navPvtToSample(raw, callbacks.resolveElapsedMs, batteryLevel);
              if (sample) {
                callbacks.onSample(sample);
              }
              return;
            }

            if (
              (messageClass === CFG_CLASS && messageId === CFG_VALGET_ID) ||
              messageClass === ACK_CLASS
            ) {
              pendingConfigReply?.({ messageClass, messageId, payload });
            }
          },
          onError: (error) => callbacks.onError(error),
        });

        bleSubscription = subscribeToCharacteristic(
          device,
          DRAGY_SERVICE_UUID,
          DRAGY_STREAM_CHARACTERISTIC_UUID,
          (data) => packetBuffer?.append(data),
          (error) => callbacks.onError(error),
          () => {
            connectionState = 'disconnected';
            callbacks.onStateChange('disconnected');
            rejectLink(new Error('Dragy disconnected before streaming'));
          }
        );

        await applyTrackConfig(device, linkLost);

        if (!streamSeen) {
          const probe = new Promise<never>((_, reject) => {
            probeTimeout = setTimeout(() => {
              reject(new Error(`No GNSS stream within ${STREAM_PROBE_TIMEOUT_MS} ms`));
            }, STREAM_PROBE_TIMEOUT_MS);
          });
          await Promise.race([streamSeenPromise, linkLost, probe]);
        }

        connected = true;
        connectionState = 'connected';
        callbacks.onStateChange('connected');

        batteryTimer = setInterval(() => {
          void readBattery(device);
        }, BATTERY_POLL_INTERVAL_MS);
      } catch (error) {
        teardown();
        await disconnectDevice(deviceId);
        connectionState = 'disconnected';
        throw error;
      } finally {
        if (probeTimeout !== null) {
          clearTimeout(probeTimeout);
        }
        abortLink = null;
      }
    },

    async stop() {
      abortLink?.(new Error('Source stopped'));
      abortLink = null;
      teardown();
      await disconnectDevice(deviceId);
      connectionState = 'disconnected';
    },

    getConnectionState() {
      return connectionState;
    },
  };
}
