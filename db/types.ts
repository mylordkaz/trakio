export type ISODateString = string;

export type TrackDirection = 'clockwise' | 'counterclockwise';
export type SessionStatus = 'planned' | 'recording' | 'completed' | 'aborted';
export type TimingLineType =
  | 'start_finish'
  | 'sector'
  | 'speedtrap'
  | 'split'
  | 'pit_entry'
  | 'pit_exit';

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type TimingLine = {
  start: Coordinate;
  end: Coordinate;
};

export type TrackRow = {
  id: string;
  slug: string;
  name: string;
  country: string | null;
  location: string | null;
  layoutName: string | null;
  lengthMeters: number | null;
  corners: number | null;
  direction: TrackDirection | null;
  centerLatitude: number | null;
  centerLongitude: number | null;
  // Closed ring tracing the track centerline; null for tracks without one.
  path: Coordinate[] | null;
  pathWidthMeters: number | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type TimingLineRow = {
  id: string;
  trackId: string;
  name: string;
  type: TimingLineType;
  seq: number;
  a: Coordinate;
  b: Coordinate;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type TrackNoteRow = {
  id: string;
  trackId: string;
  note: string;
  seq: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type UserRow = {
  id: string;
  username: string;
  car: string | null;
  countryCode: string | null;
  avatarUri: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type SessionRow = {
  id: string;
  name: string | null;
  userId: string | null;
  car: string | null;
  condition: string | null;
  temperatureC: number | null;
  trackId: string;
  startedAt: ISODateString;
  endedAt: ISODateString | null;
  status: SessionStatus;
  notes: string | null;
  bestLapMs: number | null;
  totalLaps: number;
  maxSpeedKph: number | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type SessionNoteRow = {
  id: string;
  sessionId: string;
  note: string;
  seq: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type LapRow = {
  id: string;
  sessionId: string;
  lapNumber: number;
  startedAt: ISODateString;
  // Interpolated crossing position frozen at capture (null on laps recorded
  // before migration v16). Meaningful only as a pair.
  startedLatitude: number | null;
  startedLongitude: number | null;
  endedAt: ISODateString | null;
  lapTimeMs: number | null;
  isOutLap: 0 | 1;
  isInLap: 0 | 1;
  isTimingEstimated: 0 | 1;
  isInvalid: 0 | 1;
  maxSpeedKph: number | null;
  createdAt: ISODateString;
};

export type LapSectorRow = {
  id: string;
  lapId: string;
  sectorIndex: number;
  splitTimeMs: number;
  createdAt: ISODateString;
};

export type PersonalBest = {
  lapTimeMs: number;
  setOn: ISODateString;
  sectors: (number | null)[];
};

export type GpsPointRow = {
  id: string;
  sessionId: string;
  lapId: string | null;
  recordedAt: ISODateString;
  elapsedMs: number | null;
  latitude: number;
  longitude: number;
  speedMps: number | null;
  accuracyM: number | null;
  altitudeM: number | null;
  headingDeg: number | null;
  isTimingCrossing: 0 | 1;
  source: string | null;
  iTow: number | null;
  timeAccuracyNs: number | null;
  nanosecond: number | null;
  gForceX: number | null;
  gForceY: number | null;
  gForceZ: number | null;
  rotationRateX: number | null;
  rotationRateY: number | null;
  rotationRateZ: number | null;
  verticalAccuracyM: number | null;
  speedAccuracyMps: number | null;
  headingAccuracyDeg: number | null;
  pdop: number | null;
  satelliteCount: number | null;
  fixType: number | null;
  fixFlags: number | null;
  validityFlags: number | null;
  dateTimeFlags: number | null;
  latLonFlags: number | null;
  batteryLevel: number | null;
  isCharging: 0 | 1 | null;
  inputVoltageV: number | null;
  createdAt: ISODateString;
};
