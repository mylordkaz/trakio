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
  readCharacteristicString,
} from '@/telemetry/sources/ble-transport';
import { createPacketBuffer } from '@/telemetry/sources/racebox/packet-buffer';
import { decodeDataPayload, rawDataToSample } from '@/telemetry/sources/racebox/parser';
import { encodeConfigQuery, encodeGnssConfig } from '@/telemetry/sources/racebox/packet-writer';
import {
  resolveRaceBoxModel,
  parseFirmwareRevision,
  type RaceBoxModel,
} from '@/telemetry/sources/device-classifier';
import {
  RACEBOX_UART_SERVICE_UUID,
  RACEBOX_TX_CHARACTERISTIC_UUID,
  RACEBOX_RX_CHARACTERISTIC_UUID,
  DATA_MESSAGE_CLASS,
  DATA_MESSAGE_ID,
  CONFIG_MESSAGE_ID,
  DEVICE_INFO_SERVICE_UUID,
  MODEL_CHARACTERISTIC_UUID,
  FIRMWARE_REVISION_CHARACTERISTIC_UUID,
  CONFIG_MIN_FIRMWARE_MAJOR,
  CONFIG_MIN_FIRMWARE_MINOR,
  AUTOMOTIVE_DYNAMIC_MODEL,
  GROUND_SPEED_REPORTING,
  CONFIG_RESPONSE_TIMEOUT_MS,
} from '@/telemetry/sources/racebox/constants';

type FirmwareVersion = { major: number; minor: number };
type ConfigReply = { id: number; payload: Uint8Array };

function firmwareSupportsConfig(firmware: FirmwareVersion | null): boolean {
  if (!firmware) {
    return false;
  }
  if (firmware.major !== CONFIG_MIN_FIRMWARE_MAJOR) {
    return firmware.major > CONFIG_MIN_FIRMWARE_MAJOR;
  }
  return firmware.minor >= CONFIG_MIN_FIRMWARE_MINOR;
}

export function createRaceBoxSource(
  deviceId: string,
  deviceName: string
): TelemetrySource {
  let connectionState: SourceConnectionState = 'disconnected';
  let bleSubscription: { remove: () => void } | null = null;
  let packetBuffer: ReturnType<typeof createPacketBuffer> | null = null;
  let deviceModel: RaceBoxModel = resolveRaceBoxModel(null, deviceName);

  // Resolves the next config-related reply (a config value message, ACK, or NACK).
  let pendingConfigReply: ((reply: ConfigReply) => void) | null = null;

  function awaitConfigReply(): Promise<ConfigReply | null> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pendingConfigReply = null;
        resolve(null);
      }, CONFIG_RESPONSE_TIMEOUT_MS);

      pendingConfigReply = (reply) => {
        clearTimeout(timeout);
        pendingConfigReply = null;
        resolve(reply);
      };
    });
  }

  // Ensures the receiver is in a track-appropriate mode (automotive dynamic
  // model, ground-speed reporting). Reads the current config first so we can
  // preserve the device's own minimum-accuracy byte, and only writes when the
  // mode actually differs — a default device is left untouched. Best-effort:
  // requires firmware 3.3+ and never blocks the data stream.
  async function applyTrackConfig(
    device: Device,
    firmware: FirmwareVersion | null
  ): Promise<void> {
    if (!firmwareSupportsConfig(firmware)) {
      return;
    }

    await writeCharacteristic(
      device,
      RACEBOX_UART_SERVICE_UUID,
      RACEBOX_RX_CHARACTERISTIC_UUID,
      encodeConfigQuery()
    );

    const current = await awaitConfigReply();
    if (!current || current.id !== CONFIG_MESSAGE_ID || current.payload.length < 3) {
      return;
    }

    const [currentModel, currentSpeedMode, currentAccuracyByte] = current.payload;
    if (
      currentModel === AUTOMOTIVE_DYNAMIC_MODEL &&
      currentSpeedMode === GROUND_SPEED_REPORTING
    ) {
      return;
    }

    await writeCharacteristic(
      device,
      RACEBOX_UART_SERVICE_UUID,
      RACEBOX_RX_CHARACTERISTIC_UUID,
      encodeGnssConfig(AUTOMOTIVE_DYNAMIC_MODEL, GROUND_SPEED_REPORTING, currentAccuracyByte)
    );
    // Drain the ACK/NACK; the config is persistent either way.
    await awaitConfigReply();
  }

  return {
    sourceType: 'racebox',

    async start(callbacks: TelemetrySourceCallbacks) {
      connectionState = 'connecting';
      callbacks.onStateChange('connecting');

      const device = await connectToDevice(deviceId);

      // Identify the device from the Device Info Service; battery decoding and
      // the config gate depend on model and firmware. Best-effort — fall back
      // to the advertised name if the reads fail.
      const [modelString, firmwareString] = await Promise.all([
        readCharacteristicString(
          device,
          DEVICE_INFO_SERVICE_UUID,
          MODEL_CHARACTERISTIC_UUID
        ).catch(() => null),
        readCharacteristicString(
          device,
          DEVICE_INFO_SERVICE_UUID,
          FIRMWARE_REVISION_CHARACTERISTIC_UUID
        ).catch(() => null),
      ]);
      deviceModel = resolveRaceBoxModel(modelString, deviceName);
      const firmware = parseFirmwareRevision(firmwareString);

      connectionState = 'connected';
      callbacks.onStateChange('connected');

      packetBuffer = createPacketBuffer({
        onPacket: (msgClass, msgId, payload) => {
          if (msgClass !== DATA_MESSAGE_CLASS) {
            return;
          }

          if (msgId === DATA_MESSAGE_ID) {
            const raw = decodeDataPayload(payload);
            if (!raw) {
              return;
            }

            const sample = rawDataToSample(raw, callbacks.resolveElapsedMs, deviceModel);
            if (!sample) {
              return;
            }

            callbacks.onSample(sample);
            return;
          }

          // ACK (0x02), NACK (0x03), and config value (0x27) replies.
          pendingConfigReply?.({ id: msgId, payload });
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

      // Fire-and-forget: the device already streams data with default config,
      // so a config failure must not affect recording.
      void applyTrackConfig(device, firmware).catch(() => undefined);
    },

    async stop() {
      pendingConfigReply = null;
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
