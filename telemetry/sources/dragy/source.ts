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
  let pendingConfigReply: ((reply: ConfigReply | null) => void) | null = null;
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

  function awaitConfigReply(): Promise<ConfigReply | null> {
    return new Promise<ConfigReply | null>((resolve) => {
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
  }

  // The waiter is registered before the write: the device can notify its reply
  // before the write response reaches the phone.
  async function sendCommand(
    device: Device,
    packet: Uint8Array,
    linkLost: Promise<never>
  ): Promise<{ sent: boolean; reply: ConfigReply | null }> {
    const reply = awaitConfigReply();
    let sent = true;
    try {
      await writeCharacteristic(
        device,
        DRAGY_SERVICE_UUID,
        DRAGY_COMMAND_CHARACTERISTIC_UUID,
        packet
      );
    } catch {
      sent = false;
      pendingConfigReply?.(null);
    }
    return { sent, reply: await Promise.race([linkLost, reply]) };
  }

  // Four-GNSS and the 25 Hz rate are only honoured in Performance Mode, which
  // the vendor detects with a proprietary VALGET. The vendor asks for Four-GNSS
  // on every connection; the rate is only written when it differs. A device
  // outside Performance Mode streams at its default and is left untouched.
  async function applyTrackConfig(device: Device, linkLost: Promise<never>): Promise<void> {
    const mode = await sendCommand(device, encodePerformanceModeQuery(), linkLost);
    const performanceMode =
      mode.reply !== null &&
      mode.reply.messageClass === CFG_CLASS &&
      mode.reply.messageId === CFG_VALGET_ID &&
      isPerformanceModeReply(mode.reply.payload);
    if (!performanceMode) {
      return;
    }

    if (!(await sendCommand(device, encodeFourGnssConfig(), linkLost)).sent) {
      return;
    }

    const rate = await sendCommand(device, encodeRateQuery(), linkLost);
    if (!rate.sent) {
      return;
    }
    const currentPeriod =
      rate.reply !== null &&
      rate.reply.messageClass === CFG_CLASS &&
      rate.reply.messageId === CFG_VALGET_ID
        ? decodeMeasurementPeriodReply(rate.reply.payload)
        : null;
    if (currentPeriod === TARGET_MEAS_PERIOD_MS) {
      return;
    }

    await sendCommand(device, encodeRateConfig(TARGET_MEAS_PERIOD_MS), linkLost);
  }

  return {
    sourceType: 'dragy',

    async start(callbacks: TelemetrySourceCallbacks) {
      connectionState = 'connecting';
      callbacks.onStateChange('connecting');

      const device = await connectToDevice(deviceId);

      let linkError: Error | null = null;
      let rejectLink: (error: Error) => void = () => undefined;
      const linkLost = new Promise<never>((_, reject) => {
        rejectLink = (error) => {
          linkError ??= error;
          reject(error);
        };
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
        // A reply and the disconnect can land in the same tick, letting the
        // exchange finish normally; an earlier NAV frame must not then count as connected.
        if (linkError) {
          throw linkError;
        }

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
