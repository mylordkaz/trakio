import type { LocationSubscription } from 'expo-location';
import type { TelemetrySample, TelemetryElapsedMsResolver } from '@/telemetry/types';
import type {
  ActiveSourceInfo,
  DiscoveredDevice,
  ExternalDeviceState,
  TelemetrySource,
} from '@/telemetry/sources/types';
import {
  startLocationSubscription,
  stopLocationSubscription,
} from '@/telemetry/location';
import { createRaceBoxSource } from '@/telemetry/sources/racebox/source';

export type ConnectionLifecycleCallbacks = {
  onSample: (sample: TelemetrySample) => void;
  onError: (error: Error) => void;
  onActiveSourceChange: (source: ActiveSourceInfo) => void;
  onExternalDeviceStateChange: (state: ExternalDeviceState) => void;
  resolveElapsedMs: TelemetryElapsedMsResolver;
};

export type ConnectionLifecycleConfig = {
  retryAttempts?: number;
  retryWindowMs?: number;
  reconnectDelayMs?: number;
  onResetContinuity?: () => void;
};

export function createConnectionLifecycle(config?: ConnectionLifecycleConfig) {
  let callbacks: ConnectionLifecycleCallbacks | null = null;
  let phoneGpsSubscription: LocationSubscription | null = null;
  let externalSource: TelemetrySource | null = null;
  let externalDevice: DiscoveredDevice | null = null;
  let activeSource: ActiveSourceInfo = { sourceType: 'gps', deviceName: null };
  let stopped = false;

  function setActiveSource(source: ActiveSourceInfo): void {
    activeSource = source;
    callbacks?.onActiveSourceChange(source);
  }

  async function startPhoneGps(forward: boolean): Promise<void> {
    if (stopped || !callbacks) {
      return;
    }

    const cbs = callbacks;

    phoneGpsSubscription = await startLocationSubscription({
      resolveElapsedMs: cbs.resolveElapsedMs,
      onSample: (sample) => {
        if (stopped || !forward) {
          return;
        }
        cbs.onSample(sample);
      },
      onError: (error) => {
        if (stopped) {
          return;
        }
        cbs.onError(error);
      },
    });
  }

  function stopPhoneGps(): void {
    stopLocationSubscription(phoneGpsSubscription);
    phoneGpsSubscription = null;
  }

  function createSourceForDevice(device: DiscoveredDevice): TelemetrySource | null {
    if (device.classification.protocol === 'racebox-binary') {
      return createRaceBoxSource(device.id, device.name);
    }
    return null;
  }

  async function startExternalSource(
    device: DiscoveredDevice,
    cbs: ConnectionLifecycleCallbacks
  ): Promise<boolean> {
    const source = createSourceForDevice(device);
    if (!source) {
      return false;
    }

    externalSource = source;
    externalDevice = device;

    try {
      cbs.onExternalDeviceStateChange('connecting');

      await source.start({
        resolveElapsedMs: cbs.resolveElapsedMs,
        onSample: (sample) => {
          if (stopped) {
            return;
          }
          cbs.onSample(sample);
        },
        onError: (error) => {
          if (stopped) {
            return;
          }
          cbs.onError(error);
        },
        onStateChange: (state) => {
          if (stopped) {
            return;
          }
          if (state === 'disconnected') {
            void handleExternalDisconnect();
          }
        },
      });

      cbs.onExternalDeviceStateChange('connected');
      setActiveSource({ sourceType: source.sourceType, deviceName: device.name });
      return true;
    } catch {
      externalSource = null;
      externalDevice = null;
      cbs.onExternalDeviceStateChange('disconnected');
      return false;
    }
  }

  async function handleExternalDisconnect(): Promise<void> {
    if (stopped || !callbacks || !externalDevice) {
      return;
    }

    const cbs = callbacks;
    const device = externalDevice;
    const retryAttempts = config?.retryAttempts ?? 3;
    const reconnectDelayMs = config?.reconnectDelayMs ?? 1500;

    cbs.onExternalDeviceStateChange('reconnecting');

    if (externalSource) {
      try {
        await externalSource.stop();
      } catch {
        // Source may already be torn down from the disconnect
      }
      externalSource = null;
    }

    stopPhoneGps();
    await startPhoneGps(false);

    for (let attempt = 0; attempt < retryAttempts; attempt++) {
      if (stopped) {
        return;
      }

      await new Promise((r) => setTimeout(r, reconnectDelayMs));

      if (stopped) {
        return;
      }

      const reconnected = await startExternalSource(device, cbs);
      if (reconnected) {
        config?.onResetContinuity?.();
        stopPhoneGps();
        return;
      }
    }

    // Retries exhausted — fall back to phone GPS
    config?.onResetContinuity?.();
    setActiveSource({ sourceType: 'gps', deviceName: null });
    cbs.onExternalDeviceStateChange('disconnected');

    // Promote warm standby: stop the non-forwarding subscription and start a forwarding one
    stopPhoneGps();
    await startPhoneGps(true);
  }

  async function start(
    cbs: ConnectionLifecycleCallbacks,
    device?: DiscoveredDevice
  ): Promise<void> {
    callbacks = cbs;
    stopped = false;

    if (device) {
      const connected = await startExternalSource(device, cbs);
      if (connected) {
        return;
      }
    }

    setActiveSource({ sourceType: 'gps', deviceName: null });
    cbs.onExternalDeviceStateChange('disconnected');
    await startPhoneGps(true);
  }

  async function stop(): Promise<void> {
    stopped = true;
    stopPhoneGps();

    if (externalSource) {
      await externalSource.stop();
      externalSource = null;
    }

    externalDevice = null;
    callbacks = null;
  }

  function getActiveSource(): ActiveSourceInfo {
    return activeSource;
  }

  return { start, stop, getActiveSource };
}
