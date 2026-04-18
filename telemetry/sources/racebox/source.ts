import type {
  TelemetrySource,
  TelemetrySourceCallbacks,
  SourceConnectionState,
} from '@/telemetry/sources/types';
import {
  connectToDevice,
  subscribeToCharacteristic,
  disconnectDevice,
} from '@/telemetry/sources/ble-transport';
import { createPacketBuffer } from '@/telemetry/sources/racebox/packet-buffer';
import { decodeDataPayload, rawDataToSample } from '@/telemetry/sources/racebox/parser';
import {
  RACEBOX_UART_SERVICE_UUID,
  RACEBOX_TX_CHARACTERISTIC_UUID,
  DATA_MESSAGE_CLASS,
  DATA_MESSAGE_ID,
} from '@/telemetry/sources/racebox/constants';

export type RaceBoxDeviceModel = 'mini' | 'micro';

export function detectDeviceModel(deviceName: string): RaceBoxDeviceModel {
  if (deviceName.startsWith('RaceBox Micro ')) {
    return 'micro';
  }
  return 'mini';
}

export function createRaceBoxSource(
  deviceId: string,
  deviceName: string
): TelemetrySource {
  let connectionState: SourceConnectionState = 'disconnected';
  let bleSubscription: { remove: () => void } | null = null;
  let packetBuffer: ReturnType<typeof createPacketBuffer> | null = null;
  const deviceModel = detectDeviceModel(deviceName);

  return {
    sourceType: 'racebox',

    async start(callbacks: TelemetrySourceCallbacks) {
      connectionState = 'connecting';
      callbacks.onStateChange('connecting');

      const device = await connectToDevice(deviceId);

      connectionState = 'connected';
      callbacks.onStateChange('connected');

      packetBuffer = createPacketBuffer({
        onPacket: (msgClass, msgId, payload) => {
          if (msgClass !== DATA_MESSAGE_CLASS || msgId !== DATA_MESSAGE_ID) {
            return;
          }

          const raw = decodeDataPayload(payload);
          if (!raw) {
            return;
          }

          const sample = rawDataToSample(raw, callbacks.resolveElapsedMs, deviceModel);
          if (!sample) {
            return;
          }

          callbacks.onSample(sample);
        },
        onError: (error) => callbacks.onError(error),
      });

      bleSubscription = subscribeToCharacteristic(
        device,
        RACEBOX_UART_SERVICE_UUID,
        RACEBOX_TX_CHARACTERISTIC_UUID,
        (data) => packetBuffer?.append(data),
        (error) => callbacks.onError(error),
        () => {
          connectionState = 'disconnected';
          callbacks.onStateChange('disconnected');
        }
      );
    },

    async stop() {
      bleSubscription?.remove();
      bleSubscription = null;
      packetBuffer?.reset();
      packetBuffer = null;
      await disconnectDevice(deviceId);
      connectionState = 'disconnected';
    },

    getConnectionState() {
      return connectionState;
    },
  };
}
