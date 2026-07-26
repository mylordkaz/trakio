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
  readCharacteristicBytes,
} from '@/telemetry/sources/ble-transport';
import { createQstarzPacketBuffer } from '@/telemetry/sources/qstarz/packet-buffer';
import { decodeGnssRecord, rawRecordToSample } from '@/telemetry/sources/qstarz/parser';
import {
  QSTARZ_UART_SERVICE_UUID,
  QSTARZ_TX_CANDIDATE_CHARACTERISTIC_UUIDS,
  STREAM_PROBE_TIMEOUT_MS,
  BATTERY_SERVICE_UUID,
  BATTERY_LEVEL_CHARACTERISTIC_UUID,
  BATTERY_REFRESH_INTERVAL_MS,
} from '@/telemetry/sources/qstarz/constants';

export function createQstarzSource(deviceId: string): TelemetrySource {
  let connectionState: SourceConnectionState = 'disconnected';
  const subscriptions = new Map<string, { remove: () => void }>();
  let buffers: { reset: () => void }[] = [];
  let batteryTimer: ReturnType<typeof setInterval> | null = null;
  let batteryLevel: number | undefined;
  let abortProbe: ((error: Error) => void) | null = null;

  // Best-effort: a failed read keeps the last known level, an absent Battery
  // Service leaves it undefined. Never affects the data stream.
  async function refreshBatteryLevel(device: Device): Promise<void> {
    try {
      const bytes = await readCharacteristicBytes(
        device,
        BATTERY_SERVICE_UUID,
        BATTERY_LEVEL_CHARACTERISTIC_UUID
      );
      if (bytes && bytes.length >= 1 && bytes[0] <= 100) {
        batteryLevel = bytes[0];
      }
    } catch {
      // Keep the previous reading.
    }
  }

  function removeAllSubscriptions(): void {
    for (const subscription of subscriptions.values()) {
      subscription.remove();
    }
    subscriptions.clear();
    for (const buffer of buffers) {
      buffer.reset();
    }
    buffers = [];
  }

  return {
    sourceType: 'qstarz',

    // 'connected' is only reported once a characteristic has produced a
    // structurally valid GNSS record — a BLE link alone proves nothing, and
    // the wrong-but-existing notify characteristic would otherwise leave the
    // session silently without a GPS source. Both candidates are subscribed;
    // the first to speak the protocol wins and the loser is dropped.
    async start(callbacks: TelemetrySourceCallbacks) {
      connectionState = 'connecting';
      callbacks.onStateChange('connecting');

      const device = await connectToDevice(deviceId);

      let winnerUuid: string | null = null;

      let resolveProbe: () => void = () => undefined;
      let rejectProbe: (error: Error) => void = () => undefined;
      const probeDone = new Promise<void>((resolve, reject) => {
        resolveProbe = resolve;
        rejectProbe = reject;
      });
      abortProbe = rejectProbe;

      const handleRecord = (characteristicUuid: string) => (record: Uint8Array) => {
        if (winnerUuid !== null && winnerUuid !== characteristicUuid) {
          return;
        }

        const raw = decodeGnssRecord(record);
        if (!raw) {
          return;
        }

        callbacks.onActivity();

        if (winnerUuid === null) {
          winnerUuid = characteristicUuid;
          for (const [uuid, subscription] of subscriptions) {
            if (uuid !== characteristicUuid) {
              subscription.remove();
              subscriptions.delete(uuid);
            }
          }
          connectionState = 'connected';
          callbacks.onStateChange('connected');
          resolveProbe();
          // The winning record is proof of protocol, not a sample: start() has
          // not resolved yet, so the lifecycle has not switched the session
          // over — emitting now would race its timeline re-anchor.
          return;
        }

        const sample = rawRecordToSample(raw, callbacks.resolveElapsedMs, batteryLevel);
        if (!sample) {
          return;
        }

        callbacks.onSample(sample);
      };

      for (const characteristicUuid of QSTARZ_TX_CANDIDATE_CHARACTERISTIC_UUIDS) {
        const buffer = createQstarzPacketBuffer({
          onRecord: handleRecord(characteristicUuid),
          onError: (error) => callbacks.onError(error),
        });
        buffers.push(buffer);

        const subscription = subscribeToCharacteristic(
          device,
          QSTARZ_UART_SERVICE_UUID,
          characteristicUuid,
          (data) => buffer.append(data),
          (error) => callbacks.onError(error),
          () => {
            connectionState = 'disconnected';
            callbacks.onStateChange('disconnected');
            rejectProbe(new Error('Disconnected before the GNSS stream started'));
          }
        );
        subscriptions.set(characteristicUuid, subscription);
      }

      const probeTimeout = setTimeout(() => {
        rejectProbe(
          new Error(
            `No GNSS stream within ${STREAM_PROBE_TIMEOUT_MS} ms on any notify characteristic`
          )
        );
      }, STREAM_PROBE_TIMEOUT_MS);

      try {
        await probeDone;
      } catch (error) {
        removeAllSubscriptions();
        await disconnectDevice(deviceId);
        connectionState = 'disconnected';
        throw error;
      } finally {
        clearTimeout(probeTimeout);
        abortProbe = null;
      }

      void refreshBatteryLevel(device);
      batteryTimer = setInterval(
        () => void refreshBatteryLevel(device),
        BATTERY_REFRESH_INTERVAL_MS
      );
    },

    async stop() {
      abortProbe?.(new Error('Source stopped'));
      abortProbe = null;
      if (batteryTimer) {
        clearInterval(batteryTimer);
        batteryTimer = null;
      }
      removeAllSubscriptions();
      await disconnectDevice(deviceId);
      connectionState = 'disconnected';
    },

    getConnectionState() {
      return connectionState;
    },
  };
}
