import type { ExtendedTelemetrySample } from '@/telemetry/types';
import type { SourceConnectionState } from '@/telemetry/sources/types';
import { createQstarzSource } from '@/telemetry/sources/qstarz/source';
import {
  connectToDevice,
  subscribeToCharacteristic,
  disconnectDevice,
  readCharacteristicBytes,
} from '@/telemetry/sources/ble-transport';
import { QSTARZ_TX_CANDIDATE_CHARACTERISTIC_UUIDS } from '@/telemetry/sources/qstarz/constants';
import {
  GOLDEN_FIXED_FRAGMENTS_HEX,
  UNFIXED_818GT_FRAGMENTS_HEX,
  hexToBytes,
} from './helpers';

jest.mock('@/telemetry/sources/ble-transport', () => ({
  connectToDevice: jest.fn(),
  subscribeToCharacteristic: jest.fn(),
  disconnectDevice: jest.fn(),
  readCharacteristicBytes: jest.fn(),
}));

const [CHAR_0003, CHAR_0004] = QSTARZ_TX_CANDIDATE_CHARACTERISTIC_UUIDS;

type FakeCharacteristic = {
  onData: (data: Uint8Array) => void;
  onDisconnect: () => void;
  remove: jest.Mock;
};

function setupTransport() {
  const characteristics = new Map<string, FakeCharacteristic>();

  (connectToDevice as jest.Mock).mockResolvedValue({ id: 'device' });
  (disconnectDevice as jest.Mock).mockResolvedValue(undefined);
  (readCharacteristicBytes as jest.Mock).mockResolvedValue(new Uint8Array([87]));
  (subscribeToCharacteristic as jest.Mock).mockImplementation(
    (_device, _service, uuid, onData, _onError, onDisconnect) => {
      const remove = jest.fn();
      characteristics.set(uuid, { onData, onDisconnect, remove });
      return { remove };
    }
  );

  return characteristics;
}

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

function feed(characteristic: FakeCharacteristic, hexFragments: string[]) {
  for (const hex of hexFragments) {
    characteristic.onData(hexToBytes(hex));
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
});

it('reports connected only after a characteristic speaks the protocol', async () => {
  const characteristics = setupTransport();
  const { callbacks, samples, states } = collectCallbacks();
  const source = createQstarzSource('device');

  const startPromise = source.start(callbacks);
  await flush();
  expect(states).toEqual(['connecting']);

  feed(characteristics.get(CHAR_0003)!, GOLDEN_FIXED_FRAGMENTS_HEX);
  await startPromise;

  expect(states).toEqual(['connecting', 'connected']);
  expect(source.getConnectionState()).toBe('connected');

  // The winning record proves the protocol but is not emitted; the next
  // record is the first sample.
  expect(samples).toHaveLength(0);
  feed(characteristics.get(CHAR_0003)!, GOLDEN_FIXED_FRAGMENTS_HEX);
  expect(samples).toHaveLength(1);
  expect(samples[0].source).toBe('qstarz');

  // The silent candidate is dropped, the winner keeps streaming.
  expect(characteristics.get(CHAR_0004)!.remove).toHaveBeenCalled();
  expect(characteristics.get(CHAR_0003)!.remove).not.toHaveBeenCalled();

  await source.stop();
});

it('locks onto 6E400004 when the stream is there instead', async () => {
  const characteristics = setupTransport();
  const { callbacks, states } = collectCallbacks();
  const source = createQstarzSource('device');

  const startPromise = source.start(callbacks);
  await flush();

  feed(characteristics.get(CHAR_0004)!, GOLDEN_FIXED_FRAGMENTS_HEX);
  await startPromise;

  expect(states).toEqual(['connecting', 'connected']);
  expect(characteristics.get(CHAR_0003)!.remove).toHaveBeenCalled();
  expect(characteristics.get(CHAR_0004)!.remove).not.toHaveBeenCalled();

  await source.stop();
});

it('is not fooled by garbage on one characteristic', async () => {
  const characteristics = setupTransport();
  const { callbacks, states } = collectCallbacks();
  const source = createQstarzSource('device');

  const startPromise = source.start(callbacks);
  await flush();

  characteristics.get(CHAR_0003)!.onData(new Uint8Array(58).fill(0xff));
  expect(states).toEqual(['connecting']);

  feed(characteristics.get(CHAR_0004)!, GOLDEN_FIXED_FRAGMENTS_HEX);
  await startPromise;

  expect(states).toEqual(['connecting', 'connected']);
  expect(characteristics.get(CHAR_0003)!.remove).toHaveBeenCalled();

  await source.stop();
});

it('reports activity for unfixed records without emitting samples', async () => {
  const characteristics = setupTransport();
  const { callbacks, samples, states, onActivity } = collectCallbacks();
  const source = createQstarzSource('device');

  const startPromise = source.start(callbacks);
  await flush();

  feed(characteristics.get(CHAR_0003)!, UNFIXED_818GT_FRAGMENTS_HEX);
  await startPromise;
  expect(states).toEqual(['connecting', 'connected']);

  feed(characteristics.get(CHAR_0003)!, UNFIXED_818GT_FRAGMENTS_HEX);
  feed(characteristics.get(CHAR_0003)!, UNFIXED_818GT_FRAGMENTS_HEX);

  // A healthy device without a GPS lock is alive, not dead: every structural
  // decode reports activity even though nothing is usable as a sample.
  expect(onActivity).toHaveBeenCalledTimes(3);
  expect(samples).toHaveLength(0);

  await source.stop();
});

it('stamps the battery level onto samples once read', async () => {
  const characteristics = setupTransport();
  const { callbacks, samples } = collectCallbacks();
  const source = createQstarzSource('device');

  const startPromise = source.start(callbacks);
  await flush();

  feed(characteristics.get(CHAR_0003)!, GOLDEN_FIXED_FRAGMENTS_HEX);
  await startPromise;

  await flush();
  feed(characteristics.get(CHAR_0003)!, GOLDEN_FIXED_FRAGMENTS_HEX);
  expect(samples[0].batteryLevel).toBe(87);

  await source.stop();
});

it('fails start when no characteristic streams within the probe window', async () => {
  jest.useFakeTimers();
  try {
    const characteristics = setupTransport();
    const { callbacks } = collectCallbacks();
    const source = createQstarzSource('device');

    const startPromise = source.start(callbacks);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    jest.advanceTimersByTime(8000);

    await expect(startPromise).rejects.toThrow('No GNSS stream');
    expect(disconnectDevice).toHaveBeenCalled();
    expect(characteristics.get(CHAR_0003)!.remove).toHaveBeenCalled();
    expect(characteristics.get(CHAR_0004)!.remove).toHaveBeenCalled();
    expect(source.getConnectionState()).toBe('disconnected');
  } finally {
    jest.useRealTimers();
  }
});

it('fails start when the device disconnects mid-probe', async () => {
  const characteristics = setupTransport();
  const { callbacks } = collectCallbacks();
  const source = createQstarzSource('device');

  const startPromise = source.start(callbacks);
  await flush();

  characteristics.get(CHAR_0003)!.onDisconnect();

  await expect(startPromise).rejects.toThrow('Disconnected before the GNSS stream started');
  expect(disconnectDevice).toHaveBeenCalled();
});

it('aborts a pending probe when stopped', async () => {
  setupTransport();
  const { callbacks } = collectCallbacks();
  const source = createQstarzSource('device');

  const startPromise = source.start(callbacks);
  await flush();

  await source.stop();

  await expect(startPromise).rejects.toThrow('Source stopped');
});
