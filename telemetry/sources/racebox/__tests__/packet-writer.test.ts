import {
  encodePacket,
  encodeConfigQuery,
  encodeGnssConfig,
} from '@/telemetry/sources/racebox/packet-writer';
import { createPacketBuffer } from '@/telemetry/sources/racebox/packet-buffer';
import { bytesToHex } from './helpers';

it('encodes the reference GNSS-config packet from the spec', () => {
  // BLE Protocol Description rev 8, page 10: airborne <4g, 3D speed, 2.0m.
  const packet = encodePacket(0xff, 0x27, new Uint8Array([0x08, 0x01, 0x14]));
  expect(bytesToHex(packet)).toBe('b562ff2703000801144620');
});

it('builds a zero-length config query', () => {
  const query = encodeConfigQuery();
  expect(query).toHaveLength(8);
  expect(Array.from(query.slice(0, 6))).toEqual([0xb5, 0x62, 0xff, 0x27, 0x00, 0x00]);
});

it('round-trips an encoded config packet back through the parser', () => {
  const seen: { cls: number; id: number; payload: Uint8Array }[] = [];
  const buffer = createPacketBuffer({
    onPacket: (cls, id, payload) => seen.push({ cls, id, payload }),
  });

  buffer.append(encodeGnssConfig(0x08, 0x01, 0x14));

  expect(seen).toHaveLength(1);
  expect(seen[0].cls).toBe(0xff);
  expect(seen[0].id).toBe(0x27);
  expect(Array.from(seen[0].payload)).toEqual([0x08, 0x01, 0x14]);
});
