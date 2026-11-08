import type { ExtendedTelemetrySample } from '@/telemetry/types';
import type { SourceConnectionState } from '@/telemetry/sources/types';
import { createDragySource } from '@/telemetry/sources/dragy/source';
import {
  connectToDevice,
  subscribeToCharacteristic,
  disconnectDevice,
  writeCharacteristic,
  readCharacteristicBytes,
} from '@/telemetry/sources/ble-transport';
import {
  DRAGY_COMMAND_CHARACTERISTIC_UUID,
  DRAGY_STREAM_CHARACTERISTIC_UUID,
  DRAGY_HANDSHAKE_CHARACTERISTIC_UUID,
  DRAGY_BATTERY_CHARACTERISTIC_UUID,
  CONFIG_RESPONSE_TIMEOUT_MS,
  STREAM_PROBE_TIMEOUT_MS,
  BATTERY_POLL_INTERVAL_MS,
} from '@/telemetry/sources/dragy/constants';
import {
  hexToBytes,
  bytesToHex,
  frameNavPvt,
  frameAck,
  frameNak,
  fragment,
  DOC_PERFORMANCE_MODE_QUERY_HEX,
  DOC_PERFORMANCE_MODE_REPLY_HEX,
  DOC_FOUR_GNSS_CONFIG_HEX,
  DOC_RATE_QUERY_HEX,
  DOC_RATE_REPLY_10HZ_HEX,
  DOC_RATE_REPLY_25HZ_HEX,
  DOC_RATE_SET_25HZ_HEX,
} from './helpers';

jest.mock('@/telemetry/sources/ble-transport', () => ({
  connectToDevice: jest.fn(),
  subscribeToCharacteristic: jest.fn(),
  disconnectDevice: jest.fn(),
  writeCharacteristic: jest.fn(),
  readCharacteristicBytes: jest.fn(),
}));

type FakeStream = {
  onData: (data: Uint8Array) => void;
  onDisconnect: () => void;
  remove: jest.Mock;
};

const CHALLENGE = Uint8Array.from([0xa5, 0x3c]);
const HANDSHAKE_RESPONSE_HEX = 'a53c9924';
const BATTERY_84 = Uint8Array.from([0x01, 0x54]);

function setupTransport(reads: Partial<Record<string, (Uint8Array | null)[]>> = {}) {
  const streams: FakeStream[] = [];
  const writes: { uuid: string; hex: string }[] = [];
  const readQueues = new Map<string, (Uint8Array | null)[]>();
  for (const [uuid, values] of Object.entries(reads)) {
    readQueues.set(uuid, [...(values ?? [])]);
  }
  const readCount = new Map<string, number>();

  (connectToDevice as jest.Mock).mockResolvedValue({ id: 'device' });
  (disconnectDevice as jest.Mock).mockResolvedValue(undefined);
  (writeCharacteristic as jest.Mock).mockImplementation(
    async (_device, _service, uuid: string, bytes: Uint8Array) => {
      writes.push({ uuid, hex: bytesToHex(bytes) });
    }
  );
  (readCharacteristicBytes as jest.Mock).mockImplementation(
    async (_device, _service, uuid: string) => {
      readCount.set(uuid, (readCount.get(uuid) ?? 0) + 1);
      const queue = readQueues.get(uuid);
      if (!queue || queue.length === 0) {
        return null;
      }
      // The last scripted value repeats for every later read.
      return queue.length > 1 ? queue.shift()! : queue[0];
    }
  );
  (subscribeToCharacteristic as jest.Mock).mockImplementation(
    (_device, _service, _uuid, onData, _onError, onDisconnect) => {
      const remove = jest.fn();
      streams.push({ onData, onDisconnect, remove });
      return { remove };
    }
  );

  return {
    writes,
    readCount,
    commandWrites: () =>
      writes.filter((w) => w.uuid === DRAGY_COMMAND_CHARACTERISTIC_UUID).map((w) => w.hex),
    handshakeWrites: () =>
      writes.filter((w) => w.uuid === DRAGY_HANDSHAKE_CHARACTERISTIC_UUID).map((w) => w.hex),
    stream: () => streams[streams.length - 1],
    streams,
  };
}

const DRG70_READS = {
  [DRAGY_HANDSHAKE_CHARACTERISTIC_UUID]: [CHALLENGE, hexToBytes(HANDSHAKE_RESPONSE_HEX)],
  [DRAGY_BATTERY_CHARACTERISTIC_UUID]: [BATTERY_84],
};

function collectCallbacks() {
  const samples: ExtendedTelemetrySample[] = [];
  const states: SourceConnectionState[] = [];
  const errors: Error[] = [];
  const onActivity = jest.fn();
  return {
    callbacks: {
      onSample: (sample: ExtendedTelemetrySample) => samples.push(sample),
      onActivity,
      onError: (error: Error) => errors.push(error),
      onStateChange: (state: SourceConnectionState) => states.push(state),
      resolveElapsedMs: (recordedAt: number) => recordedAt,
    },
    samples,
    states,
    errors,
    onActivity,
  };
}

// Drains the promise chain between BLE round-trips without moving the clock.
async function flush() {
  for (let i = 0; i < 25; i++) {
    await Promise.resolve();
  }
}

async function advance(ms: number) {
  await jest.advanceTimersByTimeAsync(ms);
  await flush();
}

// Walks a device through the config exchange: perf reply, Four-GNSS ack,
// rate reply, and the rate-set ack when the device was not already at 25 Hz.
async function answerConfig(
  transport: ReturnType<typeof setupTransport>,
  rateReplyHex: string
) {
  const stream = transport.stream();
  stream.onData(hexToBytes(DOC_PERFORMANCE_MODE_REPLY_HEX));
  await flush();
  stream.onData(frameAck());
  await flush();
  stream.onData(hexToBytes(rateReplyHex));
  await flush();
  if (rateReplyHex !== DOC_RATE_REPLY_25HZ_HEX) {
    stream.onData(frameAck());
    await flush();
  }
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

it('handshakes, configures a 10 Hz Performance Mode device to 25 Hz, and streams', async () => {
  const transport = setupTransport(DRG70_READS);
  const { callbacks, samples, states, onActivity } = collectCallbacks();
  const source = createDragySource('device', 'DRG70-1A2B3C');

  const startPromise = source.start(callbacks);
  await flush();

  expect(states).toEqual(['connecting']);
  expect(transport.handshakeWrites()).toEqual([HANDSHAKE_RESPONSE_HEX]);
  expect(transport.commandWrites()).toEqual([DOC_PERFORMANCE_MODE_QUERY_HEX]);

  await answerConfig(transport, DOC_RATE_REPLY_10HZ_HEX);
  expect(transport.commandWrites()).toEqual([
    DOC_PERFORMANCE_MODE_QUERY_HEX,
    DOC_FOUR_GNSS_CONFIG_HEX,
    DOC_RATE_QUERY_HEX,
    DOC_RATE_SET_25HZ_HEX,
  ]);

  // Nothing is emitted until the stream proves itself; the probe frame itself is dropped.
  expect(states).toEqual(['connecting']);
  transport.stream().onData(frameNavPvt());
  await startPromise;

  expect(states).toEqual(['connecting', 'connected']);
  expect(source.getConnectionState()).toBe('connected');
  expect(onActivity).toHaveBeenCalledTimes(1);
  expect(samples).toHaveLength(0);

  transport.stream().onData(frameNavPvt());
  expect(samples).toHaveLength(1);
  expect(samples[0].source).toBe('dragy');
  expect(samples[0].batteryLevel).toBe(84);
  expect(samples[0].speedMps).toBeCloseTo(36.806, 6);

  await source.stop();
  expect(transport.stream().remove).toHaveBeenCalled();
  expect(disconnectDevice).toHaveBeenCalledWith('device');
  expect(source.getConnectionState()).toBe('disconnected');
});

it('leaves the rate alone when the device already reports 25 Hz', async () => {
  const transport = setupTransport(DRG70_READS);
  const { callbacks } = collectCallbacks();
  const source = createDragySource('device', 'DRGPR-000001');

  const startPromise = source.start(callbacks);
  await flush();
  await answerConfig(transport, DOC_RATE_REPLY_25HZ_HEX);

  expect(transport.commandWrites()).toEqual([
    DOC_PERFORMANCE_MODE_QUERY_HEX,
    DOC_FOUR_GNSS_CONFIG_HEX,
    DOC_RATE_QUERY_HEX,
  ]);

  transport.stream().onData(frameNavPvt());
  await startPromise;
  expect(source.getConnectionState()).toBe('connected');
  await source.stop();
});

it('connects at the device default when the Performance Mode query goes unanswered', async () => {
  const transport = setupTransport(DRG70_READS);
  const { callbacks, states } = collectCallbacks();
  const source = createDragySource('device', 'DRG70-1A2B3C');

  const startPromise = source.start(callbacks);
  await flush();
  // The stream is already running while the query waits; the frame counts for the probe.
  transport.stream().onData(frameNavPvt());
  await advance(CONFIG_RESPONSE_TIMEOUT_MS);
  await startPromise;

  expect(transport.commandWrites()).toEqual([DOC_PERFORMANCE_MODE_QUERY_HEX]);
  expect(states).toEqual(['connecting', 'connected']);
  await source.stop();
});

it('sends no configuration when the device NAKs the Performance Mode query', async () => {
  const transport = setupTransport(DRG70_READS);
  const { callbacks } = collectCallbacks();
  const source = createDragySource('device', 'DRG70-1A2B3C');

  const startPromise = source.start(callbacks);
  await flush();
  transport.stream().onData(frameNak());
  await flush();
  transport.stream().onData(frameNavPvt());
  await startPromise;

  expect(transport.commandWrites()).toEqual([DOC_PERFORMANCE_MODE_QUERY_HEX]);
  await source.stop();
});

it('skips the handshake on a Dragy Lite', async () => {
  const transport = setupTransport({ [DRAGY_BATTERY_CHARACTERISTIC_UUID]: [BATTERY_84] });
  const { callbacks, errors } = collectCallbacks();
  const source = createDragySource('device', 'DRGLT000042');

  const startPromise = source.start(callbacks);
  await flush();
  await answerConfig(transport, DOC_RATE_REPLY_25HZ_HEX);
  transport.stream().onData(frameNavPvt());
  await startPromise;

  expect(transport.readCount.get(DRAGY_HANDSHAKE_CHARACTERISTIC_UUID)).toBeUndefined();
  expect(transport.handshakeWrites()).toEqual([]);
  expect(errors).toEqual([]);
  expect(source.getConnectionState()).toBe('connected');
  await source.stop();
});

it('reports an unconfirmed handshake but lets the stream decide', async () => {
  const transport = setupTransport({
    [DRAGY_HANDSHAKE_CHARACTERISTIC_UUID]: [CHALLENGE, Uint8Array.from([0, 0, 0, 0])],
    [DRAGY_BATTERY_CHARACTERISTIC_UUID]: [BATTERY_84],
  });
  const { callbacks, errors } = collectCallbacks();
  const source = createDragySource('device', 'DRG70-1A2B3C');

  const startPromise = source.start(callbacks);
  await flush();
  expect(errors).toHaveLength(1);
  expect(errors[0].message).toMatch(/handshake/i);

  transport.stream().onData(frameNak());
  await flush();
  transport.stream().onData(frameNavPvt());
  await startPromise;
  expect(source.getConnectionState()).toBe('connected');
  await source.stop();
});

it('rejects when the handshake challenge is missing', async () => {
  setupTransport({ [DRAGY_BATTERY_CHARACTERISTIC_UUID]: [BATTERY_84] });
  const { callbacks } = collectCallbacks();
  const source = createDragySource('device', 'DRG70-1A2B3C');

  await expect(source.start(callbacks)).rejects.toThrow(/challenge/);
  expect(subscribeToCharacteristic).not.toHaveBeenCalled();
  expect(disconnectDevice).toHaveBeenCalledWith('device');
  expect(source.getConnectionState()).toBe('disconnected');
});

it('rejects and disconnects when nothing streams after the handshake', async () => {
  const transport = setupTransport(DRG70_READS);
  const { callbacks } = collectCallbacks();
  const source = createDragySource('device', 'DRG70-1A2B3C');

  const startPromise = source.start(callbacks);
  const rejection = expect(startPromise).rejects.toThrow(/No GNSS stream/);
  await flush();
  await advance(CONFIG_RESPONSE_TIMEOUT_MS);
  await advance(STREAM_PROBE_TIMEOUT_MS);
  await rejection;

  expect(transport.stream().remove).toHaveBeenCalled();
  expect(disconnectDevice).toHaveBeenCalledWith('device');
  expect(source.getConnectionState()).toBe('disconnected');
});

it('rejects at once when the link drops during configuration', async () => {
  const transport = setupTransport(DRG70_READS);
  const { callbacks, states } = collectCallbacks();
  const source = createDragySource('device', 'DRG70-1A2B3C');

  const startPromise = source.start(callbacks);
  const rejection = expect(startPromise).rejects.toThrow(/disconnected/);
  await flush();
  transport.stream().onDisconnect();
  await rejection;

  expect(states).toEqual(['connecting', 'disconnected']);
  expect(disconnectDevice).toHaveBeenCalledWith('device');
});

it('reassembles a NAV-PVT frame split across notifications', async () => {
  const transport = setupTransport(DRG70_READS);
  const { callbacks, samples } = collectCallbacks();
  const source = createDragySource('device', 'DRG70-1A2B3C');

  const startPromise = source.start(callbacks);
  await flush();
  transport.stream().onData(frameNak());
  await flush();
  transport.stream().onData(frameNavPvt());
  await startPromise;

  for (const piece of fragment(frameNavPvt(), 20)) {
    transport.stream().onData(piece);
  }
  expect(samples).toHaveLength(1);
  await source.stop();
});

it('polls the battery and stamps the latest reading on samples', async () => {
  const transport = setupTransport({
    [DRAGY_HANDSHAKE_CHARACTERISTIC_UUID]: [CHALLENGE, hexToBytes(HANDSHAKE_RESPONSE_HEX)],
    [DRAGY_BATTERY_CHARACTERISTIC_UUID]: [BATTERY_84, Uint8Array.from([0x01, 0x4b])],
  });
  const { callbacks, samples } = collectCallbacks();
  const source = createDragySource('device', 'DRG70-1A2B3C');

  const startPromise = source.start(callbacks);
  await flush();
  transport.stream().onData(frameNak());
  await flush();
  transport.stream().onData(frameNavPvt());
  await startPromise;

  transport.stream().onData(frameNavPvt());
  expect(samples[0].batteryLevel).toBe(84);

  await advance(BATTERY_POLL_INTERVAL_MS);
  expect(transport.readCount.get(DRAGY_BATTERY_CHARACTERISTIC_UUID)).toBe(2);
  transport.stream().onData(frameNavPvt());
  expect(samples[1].batteryLevel).toBe(75);

  await source.stop();
  await advance(BATTERY_POLL_INTERVAL_MS);
  expect(transport.readCount.get(DRAGY_BATTERY_CHARACTERISTIC_UUID)).toBe(2);
});

it('stop() is idempotent', async () => {
  const transport = setupTransport(DRG70_READS);
  const { callbacks } = collectCallbacks();
  const source = createDragySource('device', 'DRG70-1A2B3C');

  const startPromise = source.start(callbacks);
  await flush();
  transport.stream().onData(frameNak());
  await flush();
  transport.stream().onData(frameNavPvt());
  await startPromise;

  await source.stop();
  await source.stop();
  expect(transport.stream().remove).toHaveBeenCalledTimes(1);
  expect(disconnectDevice).toHaveBeenCalledTimes(2);
  expect(source.getConnectionState()).toBe('disconnected');
});
