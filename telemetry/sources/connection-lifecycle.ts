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
import { createQstarzSource } from '@/telemetry/sources/qstarz/source';
import { createStreamWatchdog } from '@/telemetry/sources/stream-watchdog';

// A stream this silent while nominally connected is dead: both supported
// devices emit records at 10-25 Hz whenever notifications are on, fix or no
// fix (liveness is fed by onActivity, so losing GPS lock is not silence).
const EXTERNAL_STREAM_SILENCE_TIMEOUT_MS = 10000;

export type ConnectionLifecycleCallbacks = {
  onSample: (sample: TelemetrySample) => void;
  onError: (error: Error) => void;
  onActiveSourceChange: (source: ActiveSourceInfo) => void;
  onExternalDeviceStateChange: (state: ExternalDeviceState) => void;
};

export type ConnectionLifecycleConfig = {
  retryAttempts?: number;
  reconnectDelayMs?: number;
  streamSilenceTimeoutMs?: number;
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
  // the first forwarded sample's own clock. On a source switch that changes
  // the clock domain (phone system time <-> device GPS time), we re-anchor so
  // elapsed continues from where it left off instead of jumping by the offset.
  let elapsedAnchorMs: number | null = null;
  let lastElapsedMs = 0;
  let continueTimelineOnNextSample = false;

  const commitElapsedMs: TelemetryElapsedMsResolver = (recordedAt) => {
    if (elapsedAnchorMs === null) {
      elapsedAnchorMs = recordedAt;
      // A continuation flag with no prior timeline is resolved by creating
      // the anchor; left set, it would re-anchor on the second sample and
      // swallow its delta.
      continueTimelineOnNextSample = false;
    } else if (continueTimelineOnNextSample) {
      elapsedAnchorMs = recordedAt - lastElapsedMs;
      continueTimelineOnNextSample = false;
    }
    lastElapsedMs = Math.max(0, recordedAt - elapsedAnchorMs);
    return lastElapsedMs;
  };

  // Fed by external-source activity; expiry is handled exactly like a BLE
  // disconnect, because a connected-but-silent source is the same failure
  // with no event of its own.
  const streamWatchdog = createStreamWatchdog(
    config?.streamSilenceTimeoutMs ?? EXTERNAL_STREAM_SILENCE_TIMEOUT_MS,
    () => {
      void handleExternalDisconnect();
    }
  );

  function setActiveSource(source: ActiveSourceInfo): void {
    activeSource = source;
    callbacks?.onActiveSourceChange(source);
  }

  let phoneGpsStarting = false;

  // Idempotent: overlapping failure paths must never stack a second
  // subscription — the retained one would be stopped later while the orphan
  // kept forwarding phone samples alongside the device.
  async function startPhoneGps(): Promise<void> {
    if (stopped || !callbacks || phoneGpsSubscription || phoneGpsStarting) {
      return;
    }
    phoneGpsStarting = true;

    const cbs = callbacks;

    try {
      const subscription = await startLocationSubscription({
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
      });

      if (stopped) {
        stopLocationSubscription(subscription);
        return;
      }
      phoneGpsSubscription = subscription;
    } finally {
      phoneGpsStarting = false;
    }
  }

  function stopPhoneGps(): void {
    stopLocationSubscription(phoneGpsSubscription);
    phoneGpsSubscription = null;
  }

  function createSourceForDevice(device: DiscoveredDevice): TelemetrySource | null {
    if (device.classification.protocol === 'racebox-binary') {
      return createRaceBoxSource(device.id, device.name);
    }
    if (device.classification.protocol === 'qstarz-ble') {
      return createQstarzSource(device.id);
    }
    return null;
  }

  // Connects and, only on success, switches the session over: any live phone
  // subscription stops, the timeline re-anchors to the device clock, and
  // detection continuity resets. No external sample is forwarded before the
  // switchover, so clock domains never mix. At session start nothing else is
  // recording and the switchover steps are no-ops.
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
    let live = false;

    try {
      cbs.onExternalDeviceStateChange('connecting');

      await source.start({
        resolveElapsedMs: commitElapsedMs,
        onActivity: () => {
          if (stopped || !live) {
            return;
          }
          streamWatchdog.arm();
        },
        onSample: (sample) => {
          if (stopped || !live) {
            return;
          }
          streamWatchdog.arm();
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
          // Pre-switchover disconnects already reject the pending start() and
          // reach its caller as a failed attempt; handling them here too would
          // run two fallback paths concurrently.
          if (state === 'disconnected' && live) {
            void handleExternalDisconnect();
          }
        },
      });

      // stop() or a pre-switchover disconnect may have landed while start was
      // pending (a stopped source can resolve normally); activating now would
      // resurrect a dead session or a dead link.
      if (stopped || externalSource !== source || source.getConnectionState() !== 'connected') {
        try {
          await source.stop();
        } catch {
          // Already torn down.
        }
        if (externalSource === source) {
          externalSource = null;
          externalDevice = null;
        }
        cbs.onExternalDeviceStateChange('disconnected');
        return false;
      }

      stopPhoneGps();
      // Phone system clock -> device GPS clock.
      continueTimelineOnNextSample = true;
      config?.onResetContinuity?.();
      live = true;
      cbs.onExternalDeviceStateChange('connected');
      setActiveSource({ sourceType: source.sourceType, deviceName: device.name });
      streamWatchdog.arm();
      return true;
    } catch {
      // Best-effort: a failure after the BLE connect (e.g. service discovery)
      // can leave the link open with nobody owning it.
      try {
        await source.stop();
      } catch {
        // Already torn down.
      }
      if (externalSource === source) {
        externalSource = null;
        externalDevice = null;
      }
      cbs.onExternalDeviceStateChange('disconnected');
      return false;
    }
  }

  async function handleExternalDisconnect(): Promise<void> {
    if (stopped || !callbacks || !externalDevice) {
      return;
    }
    // Guard against overlapping runs: a rapid disconnect/reconnect could
    // otherwise start two phone subscriptions and leak one.
    if (reconnecting) {
      return;
    }
    reconnecting = true;
    streamWatchdog.disarm();

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

      // Phone GPS records immediately: with the connect timeout and stream
      // probe, reconnection can take tens of seconds, and losing that much
      // telemetry to a background retry is worse than re-anchoring the
      // timeline twice. Device GPS clock -> phone system clock.
      continueTimelineOnNextSample = true;
      config?.onResetContinuity?.();
      setActiveSource({ sourceType: 'gps', deviceName: null });
      stopPhoneGps();
      await startPhoneGps();

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
          return;
        }
      }

      // Retries exhausted — the session stays on phone GPS, which has been
      // recording throughout.
      cbs.onExternalDeviceStateChange('disconnected');
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

    // A selected device has priority: it connects and proves its stream with
    // nothing else recording. Phone GPS is the fallback only — no device,
    // device failed to start, or (via handleExternalDisconnect) a connected
    // device lost mid-session.
    if (device) {
      const connected = await startExternalSource(device, cbs);
      if (connected) {
        return;
      }
    }

    setActiveSource({ sourceType: 'gps', deviceName: null });
    cbs.onExternalDeviceStateChange('disconnected');
    await startPhoneGps();
  }

  async function stop(): Promise<void> {
    stopped = true;
    streamWatchdog.disarm();
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
