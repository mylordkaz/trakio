// Reference RaceBox Mini / Mini S data message from the BLE Protocol
// Description rev 8 (pages 7-8): a full 88-byte packet with header and checksum.
export const GOLDEN_DATA_PACKET_HEX =
  'b562ff015000a0e70c07e607010a0833' +
  '0837190000002aad4d0e0301ea0bc693' +
  'e10d3b376f19618c09000f0109009c03' +
  '00002c0700002300000000000000d000' +
  '000088a9dd002c010059fdff7100ce03' +
  '2fff5600fcff06db';

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
