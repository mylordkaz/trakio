import { createQstarzPacketBuffer } from '@/telemetry/sources/qstarz/packet-buffer';
import {
  GOLDEN_FIXED_FRAGMENTS_HEX,
  GOLDEN_GSV_UPDATE_FRAGMENTS_HEX,
  UNFIXED_818GT_FRAGMENTS_HEX,
  UNFIXED_GSV_TERMINATOR_FRAGMENTS_HEX,
  hexToBytes,
  bytesToHex,
  buildGnssRecord,
  fragmentRecord,
  padAndFragmentRecord,
} from './helpers';

function collect() {
  const records: Uint8Array[] = [];
  const errors: Error[] = [];
  const buffer = createQstarzPacketBuffer({
    onRecord: (record) => records.push(record),
    onError: (error) => errors.push(error),
  });
  return { buffer, records, errors };
}

function appendAll(buffer: { append: (data: Uint8Array) => void }, hexes: string[]) {
  for (const hex of hexes) {
    buffer.append(hexToBytes(hex));
  }
}

it('reassembles a 20+20+18 update into one 58-byte record', () => {
  const { buffer, records, errors } = collect();
  appendAll(buffer, GOLDEN_FIXED_FRAGMENTS_HEX);

  expect(records).toHaveLength(1);
  expect(records[0]).toHaveLength(58);
  expect(bytesToHex(records[0])).toBe(GOLDEN_FIXED_FRAGMENTS_HEX.join(''));
  expect(errors).toHaveLength(0);
});

it('round-trips a synthetic record through device-style fragmentation', () => {
  const { buffer, records } = collect();
  const record = buildGnssRecord();
  for (const fragment of fragmentRecord(record)) {
    buffer.append(fragment);
  }

  expect(records).toHaveLength(1);
  expect(bytesToHex(records[0])).toBe(bytesToHex(record));
});

it('strips the zero padding and GSV packet from a 20+20+20+GSV update', () => {
  const { buffer, records } = collect();
  appendAll(buffer, GOLDEN_GSV_UPDATE_FRAGMENTS_HEX);

  expect(records).toHaveLength(1);
  expect(records[0]).toHaveLength(58);
  expect(bytesToHex(records[0])).toBe(
    GOLDEN_GSV_UPDATE_FRAGMENTS_HEX.slice(0, 3).join('').slice(0, 116)
  );
});

it('treats a standalone <00> notification as the update terminator', () => {
  const { buffer, records } = collect();
  appendAll(buffer, UNFIXED_GSV_TERMINATOR_FRAGMENTS_HEX);

  expect(records).toHaveLength(1);
  expect(records[0]).toHaveLength(58);
  expect(records[0][0]).toBe(1);
});

it('handles 7- and 13-byte GSV packets', () => {
  for (const gsvLength of [7, 13]) {
    const { buffer, records } = collect();
    const record = buildGnssRecord();
    for (const fragment of padAndFragmentRecord(record, new Uint8Array(gsvLength))) {
      buffer.append(fragment);
    }
    expect(records).toHaveLength(1);
    expect(bytesToHex(records[0])).toBe(bytesToHex(record));
  }
});

it('emits records without gating on fix status', () => {
  const { buffer, records } = collect();
  appendAll(buffer, UNFIXED_818GT_FRAGMENTS_HEX);

  expect(records).toHaveLength(1);
  expect(records[0][0]).toBe(1);
});

it('keeps consecutive updates apart', () => {
  const { buffer, records } = collect();
  appendAll(buffer, GOLDEN_FIXED_FRAGMENTS_HEX);
  appendAll(buffer, UNFIXED_818GT_FRAGMENTS_HEX);

  expect(records).toHaveLength(2);
  expect(records[0][0]).toBe(3);
  expect(records[1][0]).toBe(1);
});

it('accepts a whole 58-byte update in a single notification', () => {
  const { buffer, records } = collect();
  const record = buildGnssRecord();
  buffer.append(record);

  expect(records).toHaveLength(1);
  expect(bytesToHex(records[0])).toBe(bytesToHex(record));
});

it('accepts a whole padded update with trailing GSV in a single notification', () => {
  const { buffer, records } = collect();
  const record = buildGnssRecord();
  const whole = new Uint8Array(79);
  whole.set(record);
  buffer.append(whole);

  expect(records).toHaveLength(1);
  expect(bytesToHex(records[0])).toBe(bytesToHex(record));
});

it('drops a partial update from subscribing mid-transmission, then syncs', () => {
  const { buffer, records, errors } = collect();
  buffer.append(hexToBytes(GOLDEN_FIXED_FRAGMENTS_HEX[1]));
  buffer.append(hexToBytes(GOLDEN_FIXED_FRAGMENTS_HEX[2]));
  expect(records).toHaveLength(0);

  appendAll(buffer, GOLDEN_FIXED_FRAGMENTS_HEX);
  expect(records).toHaveLength(1);
  expect(errors).toHaveLength(0);
});

it('drops completed updates with off-protocol lengths', () => {
  const { buffer, records } = collect();
  buffer.append(new Uint8Array(59));
  buffer.append(new Uint8Array(200));
  appendAll(buffer, GOLDEN_FIXED_FRAGMENTS_HEX);

  expect(records).toHaveLength(1);
});

it('drops a padded update whose GSV packet never arrives', () => {
  const { buffer, records } = collect();
  const fragments = padAndFragmentRecord(buildGnssRecord(), new Uint8Array(7)).slice(0, 3);
  for (const fragment of fragments) {
    buffer.append(fragment);
  }
  buffer.append(new Uint8Array(0));

  expect(records).toHaveLength(0);
});

it('drops a lone GSV packet from subscribing between updates', () => {
  const { buffer, records } = collect();
  buffer.append(hexToBytes(GOLDEN_GSV_UPDATE_FRAGMENTS_HEX[3]));

  expect(records).toHaveLength(0);
});

it('drops a 60+ byte assembly whose padding marker bytes are not zero', () => {
  const { buffer, records } = collect();
  const misaligned = new Uint8Array(60);
  misaligned.set(buildGnssRecord());
  misaligned[58] = 0xab;
  misaligned[59] = 0xcd;
  buffer.append(misaligned.slice(0, 20));
  buffer.append(misaligned.slice(20, 40));
  buffer.append(misaligned.slice(40, 60));
  buffer.append(new Uint8Array(7));
  expect(records).toHaveLength(0);

  appendAll(buffer, GOLDEN_FIXED_FRAGMENTS_HEX);
  expect(records).toHaveLength(1);
});

it('reports an overrun of 20-byte fragments and recovers', () => {
  const { buffer, records, errors } = collect();
  for (let i = 0; i < 4; i++) {
    buffer.append(new Uint8Array(20));
  }
  expect(errors).toHaveLength(1);
  expect(records).toHaveLength(0);

  appendAll(buffer, GOLDEN_FIXED_FRAGMENTS_HEX);
  expect(records).toHaveLength(1);
});

it('survives an empty notification', () => {
  const { buffer, records, errors } = collect();
  buffer.append(new Uint8Array(0));
  appendAll(buffer, GOLDEN_FIXED_FRAGMENTS_HEX);

  expect(records).toHaveLength(1);
  expect(errors).toHaveLength(0);
});

it('discards pending fragments on reset', () => {
  const { buffer, records } = collect();
  buffer.append(hexToBytes(GOLDEN_FIXED_FRAGMENTS_HEX[0]));
  buffer.reset();
  appendAll(buffer, GOLDEN_FIXED_FRAGMENTS_HEX);

  expect(records).toHaveLength(1);
  expect(bytesToHex(records[0])).toBe(GOLDEN_FIXED_FRAGMENTS_HEX.join(''));
});
