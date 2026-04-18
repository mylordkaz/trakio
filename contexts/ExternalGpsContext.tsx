import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Storage } from 'expo-sqlite/kv-store';
import type {
  DiscoveredDevice,
  ExternalDeviceState,
} from '@/telemetry/sources/types';
import {
  requestBlePermissions,
  scanForDevices,
  connectToDevice,
  disconnectDevice as bleDisconnect,
  subscribeToDisconnect,
} from '@/telemetry/sources/ble-transport';

const LAST_DEVICE_KEY = 'external_gps_last_device_id';

type ExternalGpsContextValue = {
  externalDeviceState: ExternalDeviceState;
  connectedDevice: DiscoveredDevice | null;
  scanResults: DiscoveredDevice[];
  isScanning: boolean;
  startScan: () => void;
  stopScan: () => void;
  connectDevice: (device: DiscoveredDevice) => Promise<void>;
  disconnectDevice: () => Promise<void>;
  lastConnectedDeviceId: string | null;
};

const ExternalGpsContext = createContext<ExternalGpsContextValue>({
  externalDeviceState: 'disconnected',
  connectedDevice: null,
  scanResults: [],
  isScanning: false,
  startScan: () => {},
  stopScan: () => {},
  connectDevice: async () => {},
  disconnectDevice: async () => {},
  lastConnectedDeviceId: null,
});

export function ExternalGpsProvider({ children }: { children: React.ReactNode }) {
  const [deviceState, setDeviceState] = useState<ExternalDeviceState>('disconnected');
  const [connectedDevice, setConnectedDevice] = useState<DiscoveredDevice | null>(null);
  const [scanResults, setScanResults] = useState<DiscoveredDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [lastConnectedDeviceId, setLastConnectedDeviceId] = useState<string | null>(
    () => Storage.getItemSync(LAST_DEVICE_KEY) ?? null
  );
  const scanHandleRef = useRef<{ stop: () => void } | null>(null);
  const disconnectSubRef = useRef<{ remove: () => void } | null>(null);

  const stopScan = useCallback(() => {
    scanHandleRef.current?.stop();
    scanHandleRef.current = null;
    setIsScanning(false);
  }, []);

  const handleRemoteDisconnect = useCallback(() => {
    disconnectSubRef.current?.remove();
    disconnectSubRef.current = null;
    setConnectedDevice(null);
    setDeviceState('disconnected');
  }, []);

  const startScan = useCallback(async () => {
    const permitted = await requestBlePermissions();
    if (!permitted) {
      return;
    }

    setScanResults([]);
    setIsScanning(true);
    setDeviceState('scanning');

    scanHandleRef.current = scanForDevices(
      (device) => {
        setScanResults((prev) => {
          if (prev.some((d) => d.id === device.id)) {
            return prev;
          }
          return [...prev, device];
        });
      },
      () => {
        stopScan();
        setDeviceState((prev) => (prev === 'scanning' ? 'disconnected' : prev));
      },
      () => {
        scanHandleRef.current = null;
        setIsScanning(false);
        setDeviceState((prev) => (prev === 'scanning' ? 'disconnected' : prev));
      },
      10000
    );
  }, [stopScan]);

  const connectDeviceFn = useCallback(async (device: DiscoveredDevice) => {
    stopScan();
    setDeviceState('connecting');

    try {
      const bleDevice = await connectToDevice(device.id);

      disconnectSubRef.current?.remove();
      disconnectSubRef.current = subscribeToDisconnect(bleDevice, handleRemoteDisconnect);

      setConnectedDevice(device);
      setDeviceState('connected');
      setLastConnectedDeviceId(device.id);
      Storage.setItemSync(LAST_DEVICE_KEY, device.id);
    } catch {
      setDeviceState('disconnected');
      setConnectedDevice(null);
    }
  }, [stopScan, handleRemoteDisconnect]);

  const disconnectDeviceFn = useCallback(async () => {
    disconnectSubRef.current?.remove();
    disconnectSubRef.current = null;
    if (connectedDevice) {
      await bleDisconnect(connectedDevice.id);
    }
    setConnectedDevice(null);
    setDeviceState('disconnected');
  }, [connectedDevice]);

  return (
    <ExternalGpsContext.Provider
      value={{
        externalDeviceState: deviceState,
        connectedDevice,
        scanResults,
        isScanning,
        startScan,
        stopScan,
        connectDevice: connectDeviceFn,
        disconnectDevice: disconnectDeviceFn,
        lastConnectedDeviceId,
      }}
    >
      {children}
    </ExternalGpsContext.Provider>
  );
}

export function useExternalGps() {
  return useContext(ExternalGpsContext);
}
