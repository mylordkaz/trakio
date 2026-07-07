import {
  createAlphaBetaEstimator,
  createKalmanEstimator,
} from '@/telemetry/kalman';
import type { TelemetrySample } from '@/telemetry/types';

const LAT0 = 35;
const LNG0 = 139;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LNG = Math.cos((LAT0 * Math.PI) / 180) * M_PER_DEG_LAT;
const T0 = 1_700_000_000_000;

function sampleAt(
  eastM: number,
  northM: number,
  tS: number,
  overrides: Partial<TelemetrySample> = {}
): TelemetrySample {
  return {
    recordedAt: T0 + tS * 1000,
    elapsedMs: tS * 1000,
    lat: LAT0 + northM / M_PER_DEG_LAT,
    lng: LNG0 + eastM / M_PER_DEG_LNG,
    speedMps: 30,
    accuracyM: 4,
    headingDeg: 90,
    altitudeM: 30,
    source: 'gps',
    ...overrides,
  };
}

function eastOf(position: { lat: number; lng: number }) {
  return (position.lng - LNG0) * M_PER_DEG_LNG;
}

function northOf(position: { lat: number; lng: number }) {
  return (position.lat - LAT0) * M_PER_DEG_LAT;
}

// Deterministic pseudo-noise, zero-ish mean.
function noise(i: number, amplitudeM: number) {
  return Math.sin(i * 7919) * amplitudeM;
}

describe('createKalmanEstimator', () => {
  it('returns the raw position on the first sample', () => {
    const filter = createKalmanEstimator();
    const sample = sampleAt(0, 0, 0);
    const out = filter.step(sample);
    expect(out.lat).toBe(sample.lat);
    expect(out.lng).toBe(sample.lng);
  });

  it('reduces position noise on a straight constant-speed run', () => {
    const filter = createKalmanEstimator();
    let rawErrorSq = 0;
    let filteredErrorSq = 0;
    let count = 0;

    for (let i = 0; i <= 60; i++) {
      const truthEast = i * 30;
      const out = filter.step(sampleAt(truthEast + noise(i, 3), noise(i * 3, 3), i));
      if (i >= 10) {
        rawErrorSq += noise(i, 3) ** 2 + noise(i * 3, 3) ** 2;
        filteredErrorSq += (eastOf(out) - truthEast) ** 2 + northOf(out) ** 2;
        count++;
      }
    }

    expect(Math.sqrt(filteredErrorSq / count)).toBeLessThan(Math.sqrt(rawErrorSq / count) * 0.8);
  });

  it('gates a displaced fix so the estimate stays on the path', () => {
    const filter = createKalmanEstimator();
    let out = { lat: 0, lng: 0 };

    for (let i = 0; i <= 20; i++) {
      const northM = i === 15 ? 25 : 0; // confident 25 m teleport
      out = filter.step(sampleAt(i * 30, northM, i));
      if (i === 15) {
        expect(Math.abs(northOf(out))).toBeLessThan(3);
      }
    }

    expect(Math.abs(northOf(out))).toBeLessThan(3);
  });

  it('tracks velocity from Doppler', () => {
    const filter = createKalmanEstimator();
    for (let i = 0; i <= 10; i++) {
      filter.step(sampleAt(i * 30, 0, i));
    }
    // With velocity locked at 30 m/s east, a 1 s predict should land ~30 m ahead
    // even before the position update: verify via a fix with huge accuracy that
    // the gate accepts but barely corrects.
    const out = filter.step(sampleAt(11 * 30, 0, 11, { accuracyM: 50 }));
    expect(eastOf(out)).toBeGreaterThan(11 * 30 - 6);
    expect(eastOf(out)).toBeLessThan(11 * 30 + 6);
  });

  it('re-initializes after a silence longer than resetGapS', () => {
    const filter = createKalmanEstimator();
    for (let i = 0; i <= 5; i++) {
      filter.step(sampleAt(i * 30, 0, i));
    }
    const afterGap = sampleAt(500, 40, 17); // 11 s later, elsewhere
    const out = filter.step(afterGap);
    expect(out.lat).toBe(afterGap.lat);
    expect(out.lng).toBe(afterGap.lng);
  });

  it('does not drift while parked with jitter', () => {
    const filter = createKalmanEstimator();
    let maxOffset = 0;

    for (let i = 0; i <= 300; i++) {
      const out = filter.step(
        sampleAt(noise(i, 2), noise(i * 5, 2), i, { speedMps: 0, headingDeg: null })
      );
      if (i >= 10) {
        maxOffset = Math.max(maxOffset, Math.hypot(eastOf(out), northOf(out)));
      }
    }

    expect(maxOffset).toBeLessThan(3);
  });

  it('handles duplicate timestamps without corrupting state', () => {
    const filter = createKalmanEstimator();
    filter.step(sampleAt(0, 0, 0));
    filter.step(sampleAt(30, 0, 1));
    const out = filter.step(sampleAt(31, 0, 1)); // dt = 0 -> re-init path
    expect(Number.isFinite(out.lat)).toBe(true);
    expect(Number.isFinite(out.lng)).toBe(true);
    const next = filter.step(sampleAt(60, 0, 2));
    expect(Number.isFinite(next.lat)).toBe(true);
  });

  it('stays finite across a long mixed run at 25 Hz', () => {
    const filter = createKalmanEstimator();
    for (let i = 0; i <= 3000; i++) {
      const t = i / 25;
      const angle = t / 20;
      const out = filter.step(
        sampleAt(500 * Math.cos(angle) + noise(i, 1), 500 * Math.sin(angle) + noise(i * 7, 1), t, {
          headingDeg: ((angle * 180) / Math.PI + 90) % 360,
        })
      );
      expect(Number.isFinite(out.lat)).toBe(true);
    }
  });
});

describe('createAlphaBetaEstimator', () => {
  it('converges onto a straight constant-speed run', () => {
    const filter = createAlphaBetaEstimator();
    let out = { lat: 0, lng: 0 };
    for (let i = 0; i <= 30; i++) {
      out = filter.step(sampleAt(i * 30 + noise(i, 3), noise(i * 3, 3), i));
    }
    expect(Math.abs(eastOf(out) - 30 * 30)).toBeLessThan(5);
    expect(Math.abs(northOf(out))).toBeLessThan(5);
  });

  it('re-initializes after a long silence', () => {
    const filter = createAlphaBetaEstimator();
    for (let i = 0; i <= 5; i++) {
      filter.step(sampleAt(i * 30, 0, i));
    }
    const afterGap = sampleAt(500, 40, 17);
    const out = filter.step(afterGap);
    expect(out.lat).toBe(afterGap.lat);
    expect(out.lng).toBe(afterGap.lng);
  });
});
