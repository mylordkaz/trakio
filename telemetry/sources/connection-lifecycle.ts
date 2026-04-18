import type { LocationSubscription } from 'expo-location';
import type { TelemetrySample, TelemetryElapsedMsResolver } from '@/telemetry/types';
import type { ActiveSourceInfo, DiscoveredDevice, ExternalDeviceState } from '@/telemetry/sources/types';
import {
  startLocationSubscription,
  stopLocationSubscription,
} from '@/telemetry/location';

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
  let activeSource: ActiveSourceInfo = { sourceType: 'gps', deviceName: null };
  let stopped = false;

  async function startPhoneGps(): Promise<void> {
    if (stopped || !callbacks) {
      return;
    }

    const cbs = callbacks;

    phoneGpsSubscription = await startLocationSubscription({
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
    });
  }

  function stopPhoneGps(): void {
    stopLocationSubscription(phoneGpsSubscription);
    phoneGpsSubscription = null;
  }

  async function start(
    cbs: ConnectionLifecycleCallbacks,
    _externalDevice?: DiscoveredDevice
  ): Promise<void> {
    callbacks = cbs;
    stopped = false;

    // TODO: Phase 2+ — if externalDevice provided, create appropriate TelemetrySource,
    // connect, and stream. For now, always use phone GPS.

    activeSource = { sourceType: 'gps', deviceName: null };
    cbs.onActiveSourceChange(activeSource);
    cbs.onExternalDeviceStateChange('disconnected');

    await startPhoneGps();
  }

  async function stop(): Promise<void> {
    stopped = true;
    stopPhoneGps();
    callbacks = null;
  }

  function getActiveSource(): ActiveSourceInfo {
    return activeSource;
  }

  return { start, stop, getActiveSource };
}
