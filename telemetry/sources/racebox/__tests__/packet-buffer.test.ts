import { createPacketBuffer } from '@/telemetry/sources/racebox/packet-buffer';
import { GOLDEN_DATA_PACKET_HEX, hexToBytes } from './helpers';

const packet = hexToBytes(GOLDEN_DATA_PACKET_HEX);

function collect() {
  const packets: { cls: number; id: number; payload: Uint8Array }[] = [];
  const errors: Error[] = [];
  const buffer = createPacketBuffer({
    onPacket: (cls, id, payload) => packets.push({ cls, id, payload }),
    onError: (error) => errors.push(error),
  });
  return { buffer, packets, errors };
}

it('parses a full packet delivered in one notification', () => {
  const { buffer, packets } = collect();
  buffer.append(packet);
  expect(packets).toHaveLength(1);
  expect(packets[0].cls).toBe(0xff);
  expect(packets[0].id).toBe(0x01);
  expect(packets[0].payload).toHaveLength(80);
});

it('reassembles a packet split across three notifications', () => {
  const { buffer, packets } = collect();
  buffer.append(packet.slice(0, 20));
  buffer.append(packet.slice(20, 50));
  buffer.append(packet.slice(50));
  expect(packets).toHaveLength(1);
  expect(packets[0].payload).toHaveLength(80);
});

it('keeps a sync byte that is split across the notification boundary', () => {
  const { buffer, packets } = collect();
  // 0xB5 arrives at the end of one notification, the rest in the next.
  buffer.append(new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, packet[0]]));
  buffer.append(packet.slice(1));
  expect(packets).toHaveLength(1);
  expect(packets[0].id).toBe(0x01);
});

it('skips leading garbage before the sync word', () => {
  const { buffer, packets } = collect();
  const withGarbage = new Uint8Array([0xaa, 0xbb, 0xcc, ...packet]);
  buffer.append(withGarbage);
  expect(packets).toHaveLength(1);
});

it('reports a checksum mismatch and recovers on the next packet', () => {
  const corrupt = packet.slice();
  corrupt[86] ^= 0xff;
  const { buffer, packets, errors } = collect();
  buffer.append(corrupt);
  buffer.append(packet);
  expect(errors.length).toBeGreaterThanOrEqual(1);
  expect(packets).toHaveLength(1);
});

it('parses two packets delivered in a single notification', () => {
  const two = new Uint8Array(packet.length * 2);
  two.set(packet, 0);
  two.set(packet, packet.length);
  const { buffer, packets } = collect();
  buffer.append(two);
  expect(packets).toHaveLength(2);
});
