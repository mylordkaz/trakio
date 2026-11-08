// Reference RaceBox Mini / Mini S data message from the BLE Protocol
// Description rev 8 (pages 7-8): a full 88-byte packet with header and checksum.
export const GOLDEN_DATA_PACKET_HEX =
  'b562ff015000a0e70c07e607010a0833' +
  '0837190000002aad4d0e0301ea0bc693' +
  'e10d3b376f19618c09000f0109009c03' +
  '00002c0700002300000000000000d000' +
  '000088a9dd002c010059fdff7100ce03' +
  '2fff5600fcff06db';

export { hexToBytes, bytesToHex } from '@/telemetry/sources/ubx/__tests__/helpers';
