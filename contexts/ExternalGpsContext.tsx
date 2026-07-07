import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Storage } from 'expo-sqlite/kv-store';
import type { DiscoveredDevice } from '@/telemetry/sources/types';
import {
  requestBlePermissions,
  scanForDevices,
} from '@/telemetry/sources/ble-transport';
import { EXTERNAL_GPS_ENABLED } from '@/constants/featureFlags';

const LAST_DEVICE_KEY = 'external_gps_last_device_id';

type ExternalGpsContextValue = {
  selectedDevice: DiscoveredDevice | null;
  scanResults: DiscoveredDevice[];
  isScanning: boolean;
  startScan: () => void;
  stopScan: () => void;
  selectDevice: (device: DiscoveredDevice) => void;
  clearDevice: () => void;
  lastSelectedDeviceId: string | null;
};

const ExternalGpsContext = createContext<ExternalGpsContextValue>({
  selectedDevice: null,
  scanResults: [],
  isScanning: false,
  startScan: () => {},
  stopScan: () => {},
  selectDevice: () => {},
  clearDevice: () => {},
  lastSelectedDeviceId: null,
});

export function ExternalGpsProvider({ children }: { children: React.ReactNode }) {
  const [selectedDevice, setSelectedDevice] = useState<DiscoveredDevice | null>(null);
  const [scanResults, setScanResults] = useState<DiscoveredDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [lastSelectedDeviceId, setLastSelectedDeviceId] = useState<string | null>(
    () => Storage.getItemSync(LAST_DEVICE_KEY) ?? null
  );
  const scanHandleRef = useRef<{ stop: () => void } | null>(null);

  const stopScan = useCallback(() => {
    scanHandleRef.current?.stop();
    scanHandleRef.current = null;
    setIsScanning(false);
  }, []);

  const startScan = useCallback(async () => {
    // Defense in depth: the pairing UI is hidden while disabled, but never let
    // a scan (and thus the BLE stack) spin up either.
    if (!EXTERNAL_GPS_ENABLED) {
      return;
    }

    const permitted = await requestBlePermissions();
    if (!permitted) {
      return;
    }

    setScanResults([]);
    setIsScanning(true);

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
      },
      () => {
        scanHandleRef.current = null;
        setIsScanning(false);
      },
      10000
    );
  }, [stopScan]);

  const selectDevice = useCallback((device: DiscoveredDevice) => {
    stopScan();
    setSelectedDevice(device);
    setLastSelectedDeviceId(device.id);
    Storage.setItemSync(LAST_DEVICE_KEY, device.id);
  }, [stopScan]);

  const clearDevice = useCallback(() => {
    setSelectedDevice(null);
  }, []);

  return (
    <ExternalGpsContext.Provider
      value={{
        selectedDevice,
        scanResults,
        isScanning,
        startScan,
        stopScan,
        selectDevice,
        clearDevice,
        lastSelectedDeviceId,
      }}
    >
      {children}
    </ExternalGpsContext.Provider>
  );
}

export function useExternalGps() {
  return useContext(ExternalGpsContext);
}
