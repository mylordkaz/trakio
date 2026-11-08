import {
  encodePerformanceModeQuery,
  encodeFourGnssConfig,
  encodeRateQuery,
  encodeRateConfig,
} from '@/telemetry/sources/dragy/packet-writer';
import { createPacketBuffer } from '@/telemetry/sources/ubx/packet-buffer';
import {
  bytesToHex,
  DOC_PERFORMANCE_MODE_QUERY_HEX,
  DOC_FOUR_GNSS_CONFIG_HEX,
  DOC_RATE_QUERY_HEX,
  DOC_RATE_SET_10HZ_HEX,
  DOC_RATE_SET_20HZ_HEX,
  DOC_RATE_SET_25HZ_HEX,
} from './helpers';

it('encodes the Performance Mode detection query from the doc', () => {
  expect(bytesToHex(encodePerformanceModeQuery())).toBe(DOC_PERFORMANCE_MODE_QUERY_HEX);
});

it('encodes the Four-GNSS configuration from the doc', () => {
  expect(bytesToHex(encodeFourGnssConfig())).toBe(DOC_FOUR_GNSS_CONFIG_HEX);
});

it('encodes the update-rate query from the doc', () => {
  expect(bytesToHex(encodeRateQuery())).toBe(DOC_RATE_QUERY_HEX);
});

it('encodes each documented update-rate switch', () => {
  expect(bytesToHex(encodeRateConfig(100))).toBe(DOC_RATE_SET_10HZ_HEX);
  expect(bytesToHex(encodeRateConfig(50))).toBe(DOC_RATE_SET_20HZ_HEX);
  expect(bytesToHex(encodeRateConfig(40))).toBe(DOC_RATE_SET_25HZ_HEX);
});

it('round-trips a command through the UBX buffer', () => {
  const seen: { cls: number; id: number; payload: Uint8Array }[] = [];
  const buffer = createPacketBuffer({
    onPacket: (cls, id, payload) => seen.push({ cls, id, payload }),
  });
  buffer.append(encodeRateConfig(40));
  expect(seen).toHaveLength(1);
  expect(seen[0].cls).toBe(0x06);
  expect(seen[0].id).toBe(0x8a);
  expect(seen[0].payload).toHaveLength(10);
});
