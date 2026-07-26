import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Storage } from 'expo-sqlite/kv-store';
import type { DiscoveredDevice } from '@/telemetry/sources/types';
import { classifyDevice } from '@/telemetry/sources/device-classifier';
import {
  requestBleAccess,
  scanForDevices,
} from '@/telemetry/sources/ble-transport';
import { EXTERNAL_GPS_ENABLED } from '@/constants/featureFlags';

const LAST_DEVICE_KEY = 'external_gps_last_device';

// Classification is re-derived from the name so a device stored by an older
// build can never carry a stale protocol; rssi is a scan-time reading with no
// meaning after restore.
function restoreStoredDevice(): DiscoveredDevice | null {
  if (!EXTERNAL_GPS_ENABLED) {
    return null;
  }

  const storedValue = Storage.getItemSync(LAST_DEVICE_KEY);
  if (!storedValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(storedValue) as { id?: unknown; name?: unknown };
    if (typeof parsed.id !== 'string' || typeof parsed.name !== 'string') {
      return null;
    }

    const classification = classifyDevice(parsed.name);
    if (!classification) {
      return null;
    }

    return { id: parsed.id, name: parsed.name, rssi: -100, classification };
  } catch {
    return null;
  }
}

export type ScanBlockedReason = 'permission_denied' | 'powered_off';

type ExternalGpsContextValue = {
  selectedDevice: DiscoveredDevice | null;
  scanResults: DiscoveredDevice[];
  isScanning: boolean;
  scanBlockedReason: ScanBlockedReason | null;
  startScan: () => void;
  stopScan: () => void;
  selectDevice: (device: DiscoveredDevice) => void;
  clearDevice: () => void;
};

const ExternalGpsContext = createContext<ExternalGpsContextValue>({
  selectedDevice: null,
  scanResults: [],
  isScanning: false,
  scanBlockedReason: null,
  startScan: () => {},
  stopScan: () => {},
  selectDevice: () => {},
  clearDevice: () => {},
});

export function ExternalGpsProvider({ children }: { children: React.ReactNode }) {
  const [selectedDevice, setSelectedDevice] = useState<DiscoveredDevice | null>(
    () => restoreStoredDevice()
  );
  const [scanResults, setScanResults] = useState<DiscoveredDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanBlockedReason, setScanBlockedReason] = useState<ScanBlockedReason | null>(null);
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

    setScanResults([]);
    setScanBlockedReason(null);

    const access = await requestBleAccess();
    if (access !== 'granted') {
      setScanBlockedReason(access);
      return;
    }

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
    Storage.setItemSync(
      LAST_DEVICE_KEY,
      JSON.stringify({ id: device.id, name: device.name })
    );
  }, [stopScan]);

  const clearDevice = useCallback(() => {
    setSelectedDevice(null);
    Storage.removeItemSync(LAST_DEVICE_KEY);
  }, []);

  return (
    <ExternalGpsContext.Provider
      value={{
        selectedDevice,
        scanResults,
        isScanning,
        scanBlockedReason,
        startScan,
        stopScan,
        selectDevice,
        clearDevice,
      }}
    >
      {children}
    </ExternalGpsContext.Provider>
  );
}

export function useExternalGps() {
  return useContext(ExternalGpsContext);
}
