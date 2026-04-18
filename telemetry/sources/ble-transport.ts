import { Platform, PermissionsAndroid } from 'react-native';
import { BleManager, Device, type Subscription, State } from 'react-native-ble-plx';
import { classifyDevice } from '@/telemetry/sources/device-classifier';
import type { DiscoveredDevice } from '@/telemetry/sources/types';

let manager: BleManager | null = null;

function getManager(): BleManager {
  if (!manager) {
    manager = new BleManager();
  }
  return manager;
}

export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    const bleManager = getManager();
    const state = await new Promise<State>((resolve) => {
      const sub = bleManager.onStateChange((s) => {
        if (s !== State.Unknown) {
          sub.remove();
          resolve(s);
        }
      }, true);
    });
    return state === State.PoweredOn;
  }

  if (Platform.OS === 'android' && Platform.Version >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    return Object.values(results).every(
      (r) => r === PermissionsAndroid.RESULTS.GRANTED
    );
  }

  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }

  return false;
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

    if (!device?.name || !device.id || seen.has(device.id)) {
      return;
    }

    const classification = classifyDevice(device.name);
    if (!classification) {
      return;
    }

    seen.add(device.id);
    onDiscovered({
      id: device.id,
      name: device.name,
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
  const bleManager = getManager();
  const device = await bleManager.connectToDevice(deviceId, {
    requestMTU: 247,
  });
  await device.discoverAllServicesAndCharacteristics();
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

function base64ToBytes(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(128);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }

  const len = base64.length;
  let padding = 0;
  if (base64[len - 1] === '=') padding++;
  if (base64[len - 2] === '=') padding++;

  const byteLength = (len * 3) / 4 - padding;
  const bytes = new Uint8Array(byteLength);

  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = lookup[base64.charCodeAt(i)];
    const b = lookup[base64.charCodeAt(i + 1)];
    const c = lookup[base64.charCodeAt(i + 2)];
    const d = lookup[base64.charCodeAt(i + 3)];

    bytes[p++] = (a << 2) | (b >> 4);
    if (p < byteLength) bytes[p++] = ((b & 0x0f) << 4) | (c >> 2);
    if (p < byteLength) bytes[p++] = ((c & 0x03) << 6) | d;
  }

  return bytes;
}
