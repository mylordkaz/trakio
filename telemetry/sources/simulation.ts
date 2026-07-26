import type { ExtendedTelemetrySample, TelemetryElapsedMsResolver } from '@/telemetry/types';
import type {
  DiscoveredDevice,
  TelemetrySource,
  TelemetrySourceCallbacks,
  SourceConnectionState,
} from '@/telemetry/sources/types';
import { TRACK_SEED_DRAFTS } from '@/db/seeds';
import { toRadians } from '@/utils/geo';

// Dev-only stand-in for a Qstarz device: the simulator has no Bluetooth, and
// no hardware is on hand. Samples are tagged 'qstarz' so the demo exercises
// the production pipeline end to end; the device name is the marker that a
// session was simulated.
export const SIMULATED_QSTARZ_DEVICE_ID = 'simulated-qstarz';

export const SIMULATED_QSTARZ_DEVICE: DiscoveredDevice = {
  id: SIMULATED_QSTARZ_DEVICE_ID,
  name: 'QSTARZ1SIM0001',
  rssi: -48,
  classification: { sourceType: 'qstarz', protocol: 'qstarz-ble' },
};

const CONNECT_DELAY_MS = 800;
const TICK_MS = 100;

// Constant-speed lap on a circle tangent to the seeded Tsukuba 2000
// start/finish gate at its midpoint: the gate is crossed perpendicularly once
// per lap (~54 s), and the circle stays clear of both sector gates. The
// geometry is synthetic — only the start/finish crossing is meaningful, so
// select Tsukuba 2000 when recording to see laps.
const LAP_RADIUS_M = 300;
const SPEED_MPS = 35;
// Starts the car shortly before the gate so the opening crossing is visible.
const START_OFFSET_S = 5;

const METERS_PER_DEGREE_LAT = 111320;

const STEADY_CORNERING_G = SPEED_MPS ** 2 / LAP_RADIUS_M / 9.81;

type SimulatedPath = {
  originLat: number;
  originLng: number;
  lngScale: number;
  centerX: number;
  centerY: number;
  startAngleRad: number;
  angularRateRadPerS: number;
};

let cachedPath: SimulatedPath | null | undefined;

function buildPath(): SimulatedPath | null {
  const gate = TRACK_SEED_DRAFTS.find((seed) => seed.track.id === 'tsukuba2000')
    ?.timingLines.find((line) => line.type === 'start_finish');
  if (!gate) {
    return null;
  }

  const { latitude: aLat, longitude: aLng } = gate.a;
  const { latitude: bLat, longitude: bLng } = gate.b;
  if (aLat === null || aLng === null || bLat === null || bLng === null) {
    return null;
  }

  const originLat = (aLat + bLat) / 2;
  const originLng = (aLng + bLng) / 2;
  const lngScale = Math.cos(toRadians(originLat));

  const gateDx = (bLng - aLng) * METERS_PER_DEGREE_LAT * lngScale;
  const gateDy = (bLat - aLat) * METERS_PER_DEGREE_LAT;
  const gateLength = Math.hypot(gateDx, gateDy);

  // Circle center sits on the gate's own line, one radius from the midpoint:
  // the circle then meets the gate line only at the midpoint (tangent
  // perpendicular to the gate) and at the antipode 2R away, far off the gate.
  const centerX = (gateDx / gateLength) * LAP_RADIUS_M;
  const centerY = (gateDy / gateLength) * LAP_RADIUS_M;

  return {
    originLat,
    originLng,
    lngScale,
    centerX,
    centerY,
    startAngleRad: Math.atan2(-centerY, -centerX),
    angularRateRadPerS: SPEED_MPS / LAP_RADIUS_M,
  };
}

function getPath(): SimulatedPath | null {
  if (cachedPath === undefined) {
    cachedPath = buildPath();
  }
  return cachedPath;
}

export function simulatedSampleAtTick(
  tick: number,
  startedAtMs: number,
  resolveElapsedMs: TelemetryElapsedMsResolver
): ExtendedTelemetrySample | null {
  const path = getPath();
  if (!path) {
    return null;
  }

  const t = tick * (TICK_MS / 1000) - START_OFFSET_S;
  const angle = path.startAngleRad - path.angularRateRadPerS * t;

  const x = path.centerX + LAP_RADIUS_M * Math.cos(angle);
  const y = path.centerY + LAP_RADIUS_M * Math.sin(angle);

  const velocityX = SPEED_MPS * Math.sin(angle);
  const velocityY = -SPEED_MPS * Math.cos(angle);
  const headingDeg =
    ((Math.atan2(velocityX, velocityY) * 180) / Math.PI + 360) % 360;

  const recordedAt = startedAtMs + tick * TICK_MS;

  return {
    recordedAt,
    elapsedMs: resolveElapsedMs(recordedAt),
    lat: path.originLat + y / METERS_PER_DEGREE_LAT,
    lng: path.originLng + x / (METERS_PER_DEGREE_LAT * path.lngScale),
    speedMps: SPEED_MPS,
    accuracyM: 2.4,
    headingDeg,
    altitudeM: 28,
    source: 'qstarz',
    gForceX: 0,
    gForceY: STEADY_CORNERING_G,
    gForceZ: -1,
    pdop: Math.hypot(0.8, 1.1),
    satelliteCount: 12,
    fixType: 3,
    batteryLevel: 88,
  };
}

export function createSimulatedQstarzSource(): TelemetrySource {
  let connectionState: SourceConnectionState = 'disconnected';
  let stopped = false;
  let streamTimer: ReturnType<typeof setInterval> | null = null;

  return {
    sourceType: 'qstarz',

    async start(callbacks: TelemetrySourceCallbacks) {
      stopped = false;
      connectionState = 'connecting';
      callbacks.onStateChange('connecting');

      await new Promise((resolve) => setTimeout(resolve, CONNECT_DELAY_MS));
      if (stopped) {
        return;
      }

      if (!getPath()) {
        connectionState = 'disconnected';
        callbacks.onStateChange('disconnected');
        callbacks.onError(new Error('Simulated path unavailable: tsukuba2000 start/finish seed not found'));
        return;
      }

      connectionState = 'connected';
      callbacks.onStateChange('connected');

      const startedAtMs = Date.now();
      let tick = 0;

      streamTimer = setInterval(() => {
        const sample = simulatedSampleAtTick(tick, startedAtMs, callbacks.resolveElapsedMs);
        tick += 1;
        if (sample) {
          callbacks.onActivity();
          callbacks.onSample(sample);
        }
      }, TICK_MS);
    },

    async stop() {
      stopped = true;
      if (streamTimer) {
        clearInterval(streamTimer);
        streamTimer = null;
      }
      connectionState = 'disconnected';
    },

    getConnectionState() {
      return connectionState;
    },
  };
}
