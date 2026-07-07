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
};

export type ConnectionLifecycleConfig = {
  retryAttempts?: number;
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
  let reconnecting = false;

  // Single monotonic timeline for the whole session. Elapsed is measured from
  // the first forwarded sample's own clock. On a source switch that changes the
  // clock domain (device GPS time -> phone system time), we re-anchor so elapsed
  // continues from where it left off instead of jumping by the clock offset.
  let elapsedAnchorMs: number | null = null;
  let lastElapsedMs = 0;
  let continueTimelineOnNextSample = false;

  const commitElapsedMs: TelemetryElapsedMsResolver = (recordedAt) => {
    if (elapsedAnchorMs === null) {
      elapsedAnchorMs = recordedAt;
    } else if (continueTimelineOnNextSample) {
      elapsedAnchorMs = recordedAt - lastElapsedMs;
      continueTimelineOnNextSample = false;
    }
    lastElapsedMs = Math.max(0, recordedAt - elapsedAnchorMs);
    return lastElapsedMs;
  };

  const standbyElapsedMs: TelemetryElapsedMsResolver = (recordedAt) => {
    // Warm-standby samples are not forwarded, so they must neither advance nor
    // re-anchor the timeline.
    return elapsedAnchorMs === null ? 0 : Math.max(0, recordedAt - elapsedAnchorMs);
  };

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
      resolveElapsedMs: forward ? commitElapsedMs : standbyElapsedMs,
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
        resolveElapsedMs: commitElapsedMs,
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
    // Guard against overlapping runs: a rapid disconnect/reconnect could
    // otherwise start two warm-standby subscriptions and leak one.
    if (reconnecting) {
      return;
    }
    reconnecting = true;

    try {
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
          // Same device, same clock domain: detection continuity resets but the
          // elapsed timeline continues unchanged across the gap.
          config?.onResetContinuity?.();
          stopPhoneGps();
          return;
        }
      }

      // Retries exhausted — phone GPS becomes the active source. Its system
      // clock differs from the device's GPS clock, so continue the elapsed
      // timeline across the switch rather than letting it jump.
      continueTimelineOnNextSample = true;
      config?.onResetContinuity?.();
      setActiveSource({ sourceType: 'gps', deviceName: null });
      cbs.onExternalDeviceStateChange('disconnected');

      stopPhoneGps();
      await startPhoneGps(true);
    } finally {
      reconnecting = false;
    }
  }

  async function start(
    cbs: ConnectionLifecycleCallbacks,
    device?: DiscoveredDevice
  ): Promise<void> {
    callbacks = cbs;
    stopped = false;
    elapsedAnchorMs = null;
    lastElapsedMs = 0;
    continueTimelineOnNextSample = false;

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
