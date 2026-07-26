import type {
  TelemetrySample,
  TelemetrySampleSource,
  TelemetryElapsedMsResolver,
} from '@/telemetry/types';

export type SourceConnectionState = 'disconnected' | 'connecting' | 'connected';

export type ExternalDeviceState =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export type ActiveSourceInfo = {
  sourceType: TelemetrySampleSource;
  deviceName: string | null;
};

export type DeviceClassification = {
  sourceType: TelemetrySampleSource;
  protocol: 'racebox-binary' | 'qstarz-ble';
};

export type DiscoveredDevice = {
  id: string;
  name: string;
  rssi: number;
  classification: DeviceClassification;
};

export type TelemetrySourceCallbacks = {
  onSample: (sample: TelemetrySample) => void;
  // Fired for every structurally valid record, fix or no fix. Stream liveness
  // must not depend on GPS lock: a healthy device parked indoors emits no
  // usable samples but is not dead.
  onActivity: () => void;
  onError: (error: Error) => void;
  onStateChange: (state: SourceConnectionState) => void;
  resolveElapsedMs: TelemetryElapsedMsResolver;
};

export type TelemetrySource = {
  readonly sourceType: TelemetrySampleSource;
  start: (callbacks: TelemetrySourceCallbacks) => Promise<void>;
  stop: () => Promise<void>;
  getConnectionState: () => SourceConnectionState;
};
