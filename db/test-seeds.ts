import type { SessionStatus } from '@/db/types';

export type SessionTestSeed = {
  session: {
    id: string;
    name: string;
    trackId: string;
    startedAt: string;
    endedAt: string;
    status: SessionStatus;
    bestLapMs: number;
    totalLaps: number;
    maxSpeedKph: number;
  };
  laps: {
    id: string;
    lapNumber: number;
    startedAt: string;
    endedAt: string;
    lapTimeMs: number;
    isOutLap?: 0 | 1;
    isInvalid?: 0 | 1;
    maxSpeedKph?: number | null;
  }[];
  lapSectors: {
    id: string;
    lapId: string;
    sectorIndex: number;
    splitTimeMs: number;
  }[];
  gpsPoints: {
    id: string;
    lapId: string | null;
    recordedAt: string;
    latitude: number;
    longitude: number;
    speedMps?: number | null;
    accuracyM?: number | null;
    altitudeM?: number | null;
    headingDeg?: number | null;
    isTimingCrossing?: 0 | 1;
  }[];
  notes: {
    id: string;
    note: string;
    seq: number;
  }[];
};

export const SESSION_TEST_SEEDS: SessionTestSeed[] = [
  {
    session: {
      id: 'test-session-tsukuba2000-1',
      name: 'Track Day · Session 1',
      trackId: 'tsukuba2000',
      startedAt: '2026-03-14T08:30:00+09:00',
      endedAt: '2026-03-14T08:49:20+09:00',
      status: 'completed',
      bestLapMs: 68071,
      totalLaps: 4,
      maxSpeedKph: 167.4,
    },
    laps: [
      {
        id: 'test-lap-tsukuba2000-1-1',
        lapNumber: 1,
        startedAt: '2026-03-14T08:31:00+09:00',
        endedAt: '2026-03-14T08:32:11+09:00',
        lapTimeMs: 71184,
        maxSpeedKph: 160.9,
      },
      {
        id: 'test-lap-tsukuba2000-1-2',
        lapNumber: 2,
        startedAt: '2026-03-14T08:32:11+09:00',
        endedAt: '2026-03-14T08:33:20+09:00',
        lapTimeMs: 69221,
        maxSpeedKph: 164.2,
      },
      {
        id: 'test-lap-tsukuba2000-1-3',
        lapNumber: 3,
        startedAt: '2026-03-14T08:33:20+09:00',
        endedAt: '2026-03-14T08:34:28+09:00',
        lapTimeMs: 68071,
        maxSpeedKph: 167.4,
      },
      {
        id: 'test-lap-tsukuba2000-1-4',
        lapNumber: 4,
        startedAt: '2026-03-14T08:34:28+09:00',
        endedAt: '2026-03-14T08:35:37+09:00',
        lapTimeMs: 68842,
        maxSpeedKph: 165.1,
      },
    ],
    lapSectors: [
      { id: 'test-sector-tsukuba2000-1-1-0', lapId: 'test-lap-tsukuba2000-1-1', sectorIndex: 0, splitTimeMs: 28235 },
      { id: 'test-sector-tsukuba2000-1-1-1', lapId: 'test-lap-tsukuba2000-1-1', sectorIndex: 1, splitTimeMs: 28771 },
      { id: 'test-sector-tsukuba2000-1-1-2', lapId: 'test-lap-tsukuba2000-1-1', sectorIndex: 2, splitTimeMs: 14178 },
      { id: 'test-sector-tsukuba2000-1-2-0', lapId: 'test-lap-tsukuba2000-1-2', sectorIndex: 0, splitTimeMs: 27693 },
      { id: 'test-sector-tsukuba2000-1-2-1', lapId: 'test-lap-tsukuba2000-1-2', sectorIndex: 1, splitTimeMs: 28234 },
      { id: 'test-sector-tsukuba2000-1-2-2', lapId: 'test-lap-tsukuba2000-1-2', sectorIndex: 2, splitTimeMs: 13294 },
      { id: 'test-sector-tsukuba2000-1-3-0', lapId: 'test-lap-tsukuba2000-1-3', sectorIndex: 0, splitTimeMs: 27305 },
      { id: 'test-sector-tsukuba2000-1-3-1', lapId: 'test-lap-tsukuba2000-1-3', sectorIndex: 1, splitTimeMs: 27879 },
      { id: 'test-sector-tsukuba2000-1-3-2', lapId: 'test-lap-tsukuba2000-1-3', sectorIndex: 2, splitTimeMs: 12887 },
      { id: 'test-sector-tsukuba2000-1-4-0', lapId: 'test-lap-tsukuba2000-1-4', sectorIndex: 0, splitTimeMs: 27530 },
      { id: 'test-sector-tsukuba2000-1-4-1', lapId: 'test-lap-tsukuba2000-1-4', sectorIndex: 1, splitTimeMs: 28111 },
      { id: 'test-sector-tsukuba2000-1-4-2', lapId: 'test-lap-tsukuba2000-1-4', sectorIndex: 2, splitTimeMs: 13201 },
    ],
    gpsPoints: [
      { id: 'test-gps-tsukuba2000-1-1', lapId: 'test-lap-tsukuba2000-1-1', recordedAt: '2026-03-14T08:33:20+09:00', latitude: 36.150175, longitude: 139.919393, speedMps: 38.9, headingDeg: 94, isTimingCrossing: 1 },
      { id: 'test-gps-tsukuba2000-1-2', lapId: 'test-lap-tsukuba2000-1-1', recordedAt: '2026-03-14T08:33:27+09:00', latitude: 36.149986, longitude: 139.920308, speedMps: 33.5, headingDeg: 122 },
      { id: 'test-gps-tsukuba2000-1-3', lapId: 'test-lap-tsukuba2000-1-2', recordedAt: '2026-03-14T08:33:34+09:00', latitude: 36.149791, longitude: 139.920717, speedMps: 31.2, headingDeg: 148 },
      { id: 'test-gps-tsukuba2000-1-4', lapId: 'test-lap-tsukuba2000-1-2', recordedAt: '2026-03-14T08:33:41+09:00', latitude: 36.150507, longitude: 139.92196, speedMps: 35.8, headingDeg: 218 },
      { id: 'test-gps-tsukuba2000-1-5', lapId: 'test-lap-tsukuba2000-1-3', recordedAt: '2026-03-14T08:33:48+09:00', latitude: 36.150182, longitude: 139.922396, speedMps: 29.8, headingDeg: 266 },
      { id: 'test-gps-tsukuba2000-1-6', lapId: 'test-lap-tsukuba2000-1-3', recordedAt: '2026-03-14T08:33:56+09:00', latitude: 36.150175, longitude: 139.919393, speedMps: 41.1, headingDeg: 91, isTimingCrossing: 1 },
    ],
    notes: [
      { id: 'test-note-tsukuba2000-1-1', note: 'Good brake release into the opening sector.', seq: 0 },
      { id: 'test-note-tsukuba2000-1-2', note: 'Best lap came from a cleaner final sector exit.', seq: 1 },
    ],
  },
  {
    session: {
      id: 'test-session-tsukuba2000-2',
      name: 'Afternoon Attack',
      trackId: 'tsukuba2000',
      startedAt: '2026-03-15T13:10:00+09:00',
      endedAt: '2026-03-15T13:31:45+09:00',
      status: 'completed',
      bestLapMs: 67482,
      totalLaps: 5,
      maxSpeedKph: 169.2,
    },
    laps: [
      { id: 'test-lap-tsukuba2000-2-1', lapNumber: 1, startedAt: '2026-03-15T13:11:00+09:00', endedAt: '2026-03-15T13:12:10+09:00', lapTimeMs: 70551, maxSpeedKph: 162.8 },
      { id: 'test-lap-tsukuba2000-2-2', lapNumber: 2, startedAt: '2026-03-15T13:12:10+09:00', endedAt: '2026-03-15T13:13:19+09:00', lapTimeMs: 68944, maxSpeedKph: 166.1 },
      { id: 'test-lap-tsukuba2000-2-3', lapNumber: 3, startedAt: '2026-03-15T13:13:19+09:00', endedAt: '2026-03-15T13:14:26+09:00', lapTimeMs: 67482, maxSpeedKph: 169.2 },
      { id: 'test-lap-tsukuba2000-2-4', lapNumber: 4, startedAt: '2026-03-15T13:14:26+09:00', endedAt: '2026-03-15T13:15:34+09:00', lapTimeMs: 68133, maxSpeedKph: 167.7 },
      { id: 'test-lap-tsukuba2000-2-5', lapNumber: 5, startedAt: '2026-03-15T13:15:34+09:00', endedAt: '2026-03-15T13:16:43+09:00', lapTimeMs: 68621, maxSpeedKph: 165.9 },
    ],
    lapSectors: [
      { id: 'test-sector-tsukuba2000-2-1-0', lapId: 'test-lap-tsukuba2000-2-1', sectorIndex: 0, splitTimeMs: 28141 },
      { id: 'test-sector-tsukuba2000-2-1-1', lapId: 'test-lap-tsukuba2000-2-1', sectorIndex: 1, splitTimeMs: 28513 },
      { id: 'test-sector-tsukuba2000-2-1-2', lapId: 'test-lap-tsukuba2000-2-1', sectorIndex: 2, splitTimeMs: 13897 },
      { id: 'test-sector-tsukuba2000-2-2-0', lapId: 'test-lap-tsukuba2000-2-2', sectorIndex: 0, splitTimeMs: 27606 },
      { id: 'test-sector-tsukuba2000-2-2-1', lapId: 'test-lap-tsukuba2000-2-2', sectorIndex: 1, splitTimeMs: 28005 },
      { id: 'test-sector-tsukuba2000-2-2-2', lapId: 'test-lap-tsukuba2000-2-2', sectorIndex: 2, splitTimeMs: 13333 },
      { id: 'test-sector-tsukuba2000-2-3-0', lapId: 'test-lap-tsukuba2000-2-3', sectorIndex: 0, splitTimeMs: 27163 },
      { id: 'test-sector-tsukuba2000-2-3-1', lapId: 'test-lap-tsukuba2000-2-3', sectorIndex: 1, splitTimeMs: 27781 },
      { id: 'test-sector-tsukuba2000-2-3-2', lapId: 'test-lap-tsukuba2000-2-3', sectorIndex: 2, splitTimeMs: 12538 },
      { id: 'test-sector-tsukuba2000-2-4-0', lapId: 'test-lap-tsukuba2000-2-4', sectorIndex: 0, splitTimeMs: 27349 },
      { id: 'test-sector-tsukuba2000-2-4-1', lapId: 'test-lap-tsukuba2000-2-4', sectorIndex: 1, splitTimeMs: 27924 },
      { id: 'test-sector-tsukuba2000-2-4-2', lapId: 'test-lap-tsukuba2000-2-4', sectorIndex: 2, splitTimeMs: 12860 },
      { id: 'test-sector-tsukuba2000-2-5-0', lapId: 'test-lap-tsukuba2000-2-5', sectorIndex: 0, splitTimeMs: 27468 },
      { id: 'test-sector-tsukuba2000-2-5-1', lapId: 'test-lap-tsukuba2000-2-5', sectorIndex: 1, splitTimeMs: 28149 },
      { id: 'test-sector-tsukuba2000-2-5-2', lapId: 'test-lap-tsukuba2000-2-5', sectorIndex: 2, splitTimeMs: 13004 },
    ],
    gpsPoints: [
      { id: 'test-gps-tsukuba2000-2-1', lapId: 'test-lap-tsukuba2000-2-1', recordedAt: '2026-03-15T13:13:20+09:00', latitude: 36.150175, longitude: 139.919393, speedMps: 39.7, headingDeg: 90, isTimingCrossing: 1 },
      { id: 'test-gps-tsukuba2000-2-2', lapId: 'test-lap-tsukuba2000-2-2', recordedAt: '2026-03-15T13:13:28+09:00', latitude: 36.149986, longitude: 139.920308, speedMps: 33.9, headingDeg: 124 },
      { id: 'test-gps-tsukuba2000-2-3', lapId: 'test-lap-tsukuba2000-2-3', recordedAt: '2026-03-15T13:13:36+09:00', latitude: 36.149791, longitude: 139.920717, speedMps: 31.6, headingDeg: 149 },
      { id: 'test-gps-tsukuba2000-2-4', lapId: 'test-lap-tsukuba2000-2-3', recordedAt: '2026-03-15T13:13:44+09:00', latitude: 36.150507, longitude: 139.92196, speedMps: 36.3, headingDeg: 219 },
      { id: 'test-gps-tsukuba2000-2-5', lapId: 'test-lap-tsukuba2000-2-4', recordedAt: '2026-03-15T13:13:52+09:00', latitude: 36.150182, longitude: 139.922396, speedMps: 30.1, headingDeg: 264 },
      { id: 'test-gps-tsukuba2000-2-6', lapId: 'test-lap-tsukuba2000-2-5', recordedAt: '2026-03-15T13:14:00+09:00', latitude: 36.150175, longitude: 139.919393, speedMps: 41.6, headingDeg: 92, isTimingCrossing: 1 },
    ],
    notes: [
      { id: 'test-note-tsukuba2000-2-1', note: 'Front tires came in after lap two.', seq: 0 },
      { id: 'test-note-tsukuba2000-2-2', note: 'Need to tidy the transition into sector three.', seq: 1 },
    ],
  },
  {
    session: {
      id: 'test-session-tsukuba1000-1',
      name: 'Morning Session',
      trackId: 'tsukuba1000',
      startedAt: '2026-03-16T09:05:00+09:00',
      endedAt: '2026-03-16T09:18:10+09:00',
      status: 'completed',
      bestLapMs: 40528,
      totalLaps: 4,
      maxSpeedKph: 128.6,
    },
    laps: [
      { id: 'test-lap-tsukuba1000-1-1', lapNumber: 1, startedAt: '2026-03-16T09:06:00+09:00', endedAt: '2026-03-16T09:06:43+09:00', lapTimeMs: 42980, maxSpeedKph: 121.2 },
      { id: 'test-lap-tsukuba1000-1-2', lapNumber: 2, startedAt: '2026-03-16T09:06:43+09:00', endedAt: '2026-03-16T09:07:25+09:00', lapTimeMs: 41711, maxSpeedKph: 124.7 },
      { id: 'test-lap-tsukuba1000-1-3', lapNumber: 3, startedAt: '2026-03-16T09:07:25+09:00', endedAt: '2026-03-16T09:08:05+09:00', lapTimeMs: 40528, maxSpeedKph: 128.6 },
      { id: 'test-lap-tsukuba1000-1-4', lapNumber: 4, startedAt: '2026-03-16T09:08:05+09:00', endedAt: '2026-03-16T09:08:47+09:00', lapTimeMs: 41093, maxSpeedKph: 126.8 },
    ],
    lapSectors: [
      { id: 'test-sector-tsukuba1000-1-1-0', lapId: 'test-lap-tsukuba1000-1-1', sectorIndex: 0, splitTimeMs: 14511 },
      { id: 'test-sector-tsukuba1000-1-1-1', lapId: 'test-lap-tsukuba1000-1-1', sectorIndex: 1, splitTimeMs: 13894 },
      { id: 'test-sector-tsukuba1000-1-1-2', lapId: 'test-lap-tsukuba1000-1-1', sectorIndex: 2, splitTimeMs: 14575 },
      { id: 'test-sector-tsukuba1000-1-2-0', lapId: 'test-lap-tsukuba1000-1-2', sectorIndex: 0, splitTimeMs: 14172 },
      { id: 'test-sector-tsukuba1000-1-2-1', lapId: 'test-lap-tsukuba1000-1-2', sectorIndex: 1, splitTimeMs: 13506 },
      { id: 'test-sector-tsukuba1000-1-2-2', lapId: 'test-lap-tsukuba1000-1-2', sectorIndex: 2, splitTimeMs: 14033 },
      { id: 'test-sector-tsukuba1000-1-3-0', lapId: 'test-lap-tsukuba1000-1-3', sectorIndex: 0, splitTimeMs: 13758 },
      { id: 'test-sector-tsukuba1000-1-3-1', lapId: 'test-lap-tsukuba1000-1-3', sectorIndex: 1, splitTimeMs: 13294 },
      { id: 'test-sector-tsukuba1000-1-3-2', lapId: 'test-lap-tsukuba1000-1-3', sectorIndex: 2, splitTimeMs: 13476 },
      { id: 'test-sector-tsukuba1000-1-4-0', lapId: 'test-lap-tsukuba1000-1-4', sectorIndex: 0, splitTimeMs: 13904 },
      { id: 'test-sector-tsukuba1000-1-4-1', lapId: 'test-lap-tsukuba1000-1-4', sectorIndex: 1, splitTimeMs: 13451 },
      { id: 'test-sector-tsukuba1000-1-4-2', lapId: 'test-lap-tsukuba1000-1-4', sectorIndex: 2, splitTimeMs: 13738 },
    ],
    gpsPoints: [
      { id: 'test-gps-tsukuba1000-1-1', lapId: 'test-lap-tsukuba1000-1-1', recordedAt: '2026-03-16T09:07:25+09:00', latitude: 36.15101812356104, longitude: 139.92475581281158, speedMps: 29.7, headingDeg: 98, isTimingCrossing: 1 },
      { id: 'test-gps-tsukuba1000-1-2', lapId: 'test-lap-tsukuba1000-1-2', recordedAt: '2026-03-16T09:07:31+09:00', latitude: 36.15083826651595, longitude: 139.92393625313645, speedMps: 24.8, headingDeg: 132 },
      { id: 'test-gps-tsukuba1000-1-3', lapId: 'test-lap-tsukuba1000-1-3', recordedAt: '2026-03-16T09:07:37+09:00', latitude: 36.1508519004561, longitude: 139.92431500959535, speedMps: 26.1, headingDeg: 211 },
      { id: 'test-gps-tsukuba1000-1-4', lapId: 'test-lap-tsukuba1000-1-4', recordedAt: '2026-03-16T09:07:43+09:00', latitude: 36.15101812356104, longitude: 139.92475581281158, speedMps: 31.4, headingDeg: 101, isTimingCrossing: 1 },
    ],
    notes: [
      { id: 'test-note-tsukuba1000-1-1', note: 'Short layout rewards early throttle on exit.', seq: 0 },
    ],
  },
];
