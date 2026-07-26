import { Platform, PermissionsAndroid } from 'react-native';
import { BleManager, Device, ConnectionPriority, State } from 'react-native-ble-plx';
import { classifyDevice } from '@/telemetry/sources/device-classifier';
import type { DiscoveredDevice } from '@/telemetry/sources/types';

let manager: BleManager | null = null;

function getManager(): BleManager {
  if (!manager) {
    manager = new BleManager();
  }
  return manager;
}

async function waitForBleState(): Promise<State> {
  const bleManager = getManager();
  return new Promise<State>((resolve) => {
    const sub = bleManager.onStateChange((s) => {
      if (s !== State.Unknown) {
        sub.remove();
        resolve(s);
      }
    }, true);
  });
}

export async function isBleAvailable(): Promise<boolean> {
  const state = await waitForBleState();
  return state === State.PoweredOn;
}

export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS === 'android' && Platform.Version >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    const granted = Object.values(results).every(
      (r) => r === PermissionsAndroid.RESULTS.GRANTED
    );
    if (!granted) return false;
  } else if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    if (result !== PermissionsAndroid.RESULTS.GRANTED) return false;
  }

  return isBleAvailable();
}

export function scanForDevices(
  onDiscovered: (device: DiscoveredDevice) => void,
  onError: (error: Error) => void,
  onTimeout: () => void,
  timeoutMs = 10000
): { stop: () => void } {
  const bleManager = getManager();
  const seen = new Set<string>();
  let stopped = false;

  bleManager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
    if (stopped) {
      return;
    }

    if (error) {
      onError(error);
      return;
    }

    // iOS can deliver the advertised name only as localName while device.name
    // is a stale cache or null.
    const advertisedName = device?.name ?? device?.localName;
    if (!advertisedName || !device?.id || seen.has(device.id)) {
      return;
    }

    const classification = classifyDevice(advertisedName);
    if (!classification) {
      return;
    }

    seen.add(device.id);
    onDiscovered({
      id: device.id,
      name: advertisedName,
      rssi: device.rssi ?? -100,
      classification,
    });
  });

  const timeoutId = setTimeout(() => {
    if (!stopped) {
      stopped = true;
      bleManager.stopDeviceScan();
      onTimeout();
    }
  }, timeoutMs);

  return {
    stop: () => {
      if (!stopped) {
        stopped = true;
        clearTimeout(timeoutId);
        bleManager.stopDeviceScan();
      }
    },
  };
}

export async function connectToDevice(deviceId: string): Promise<Device> {
  const available = await isBleAvailable();
  if (!available) {
    throw new Error('Bluetooth is not available');
  }

  const bleManager = getManager();
  // iOS never times out CoreBluetooth connects on its own; without a bound, a
  // powered-off device hangs the caller (and any reconnect loop) forever.
  const device = await bleManager.connectToDevice(deviceId, {
    requestMTU: 247,
    timeout: 10000,
  });
  await device.discoverAllServicesAndCharacteristics();

  // The device streams up to 25 Hz; a high-priority (low-interval) connection
  // keeps up with it. Android-only — iOS negotiates the interval itself.
  if (Platform.OS === 'android') {
    try {
      await device.requestConnectionPriority(ConnectionPriority.High);
    } catch {
      // Non-fatal: fall back to the default connection interval.
    }
  }

  return device;
}

export function subscribeToCharacteristic(
  device: Device,
  serviceUUID: string,
  characteristicUUID: string,
  onData: (data: Uint8Array) => void,
  onError: (error: Error) => void,
  onDisconnect: () => void
): { remove: () => void } {
  const disconnectSub = device.onDisconnected((error) => {
    if (error) {
      onError(error);
    }
    onDisconnect();
  });

  const monitorSub = device.monitorCharacteristicForService(
    serviceUUID,
    characteristicUUID,
    (error, characteristic) => {
      if (error) {
        onError(error);
        return;
      }

      if (!characteristic?.value) {
        return;
      }

      const bytes = base64ToBytes(characteristic.value);
      onData(bytes);
    }
  );

  return {
    remove: () => {
      monitorSub.remove();
      disconnectSub.remove();
    },
  };
}

export function subscribeToDisconnect(
  device: Device,
  onDisconnect: () => void
): { remove: () => void } {
  const sub = device.onDisconnected(() => {
    onDisconnect();
  });
  return { remove: () => sub.remove() };
}

export async function writeCharacteristic(
  device: Device,
  serviceUUID: string,
  characteristicUUID: string,
  bytes: Uint8Array
): Promise<void> {
  await device.writeCharacteristicWithResponseForService(
    serviceUUID,
    characteristicUUID,
    bytesToBase64(bytes)
  );
}

export async function readCharacteristicBytes(
  device: Device,
  serviceUUID: string,
  characteristicUUID: string
): Promise<Uint8Array | null> {
  const characteristic = await device.readCharacteristicForService(
    serviceUUID,
    characteristicUUID
  );
  if (!characteristic.value) {
    return null;
  }

  return base64ToBytes(characteristic.value);
}

export async function readCharacteristicString(
  device: Device,
  serviceUUID: string,
  characteristicUUID: string
): Promise<string | null> {
  const bytes = await readCharacteristicBytes(device, serviceUUID, characteristicUUID);
  if (!bytes) {
    return null;
  }

  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i]);
  }
  // Device Info strings are sometimes null-padded.
  return result.replace(/\0+$/, '');
}

export async function disconnectDevice(deviceId: string): Promise<void> {
  const bleManager = getManager();
  try {
    await bleManager.cancelDeviceConnection(deviceId);
  } catch {
    // Device may already be disconnected
  }
}

export function destroyManager(): void {
  if (manager) {
    manager.destroy();
    manager = null;
  }
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_LOOKUP = (() => {
  const table = new Uint8Array(128);
  for (let i = 0; i < BASE64_CHARS.length; i++) {
    table[BASE64_CHARS.charCodeAt(i)] = i;
  }
  return table;
})();

function base64ToBytes(base64: string): Uint8Array {
  const len = base64.length;
  let padding = 0;
  if (base64[len - 1] === '=') padding++;
  if (base64[len - 2] === '=') padding++;

  const byteLength = (len * 3) / 4 - padding;
  const bytes = new Uint8Array(byteLength);

  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = BASE64_LOOKUP[base64.charCodeAt(i)];
    const b = BASE64_LOOKUP[base64.charCodeAt(i + 1)];
    const c = BASE64_LOOKUP[base64.charCodeAt(i + 2)];
    const d = BASE64_LOOKUP[base64.charCodeAt(i + 3)];

    bytes[p++] = (a << 2) | (b >> 4);
    if (p < byteLength) bytes[p++] = ((b & 0x0f) << 4) | (c >> 2);
    if (p < byteLength) bytes[p++] = ((c & 0x03) << 6) | d;
  }

  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;

    result += BASE64_CHARS[b0 >> 2];
    result += BASE64_CHARS[((b0 & 0x03) << 4) | (b1 >> 4)];
    result += i + 1 < bytes.length ? BASE64_CHARS[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < bytes.length ? BASE64_CHARS[b2 & 0x3f] : '=';
  }
  return result;
}
