import {
  SYNC_BYTE_1,
  SYNC_BYTE_2,
  HEADER_LENGTH,
  CHECKSUM_LENGTH,
  DATA_MESSAGE_CLASS,
  CONFIG_MESSAGE_ID,
} from '@/telemetry/sources/racebox/constants';

// Frames a payload into a U-Blox UBX packet: sync, class/id, little-endian
// length, payload, then the 2-byte Fletcher checksum over class..payload.
export function encodePacket(
  messageClass: number,
  messageId: number,
  payload: Uint8Array
): Uint8Array {
  const packet = new Uint8Array(HEADER_LENGTH + payload.length + CHECKSUM_LENGTH);
  packet[0] = SYNC_BYTE_1;
  packet[1] = SYNC_BYTE_2;
  packet[2] = messageClass;
  packet[3] = messageId;
  packet[4] = payload.length & 0xff;
  packet[5] = (payload.length >> 8) & 0xff;
  packet.set(payload, HEADER_LENGTH);

  let a = 0;
  let b = 0;
  for (let i = 2; i < HEADER_LENGTH + payload.length; i++) {
    a = (a + packet[i]) & 0xff;
    b = (b + a) & 0xff;
  }
  packet[HEADER_LENGTH + payload.length] = a;
  packet[HEADER_LENGTH + payload.length + 1] = b;

  return packet;
}

// An empty payload asks the device to report its current GNSS configuration.
export function encodeConfigQuery(): Uint8Array {
  return encodePacket(DATA_MESSAGE_CLASS, CONFIG_MESSAGE_ID, new Uint8Array(0));
}

// Sets the dynamic platform model and speed-reporting mode. The minimum-accuracy
// byte is passed through from the device's current config rather than synthesized:
// the spec's example and its prose disagree on that field's unit, so we never
// author a value we can't be sure of.
export function encodeGnssConfig(
  dynamicModel: number,
  speedReporting: number,
  minAccuracyByte: number
): Uint8Array {
  return encodePacket(
    DATA_MESSAGE_CLASS,
    CONFIG_MESSAGE_ID,
    new Uint8Array([dynamicModel, speedReporting, minAccuracyByte])
  );
}
