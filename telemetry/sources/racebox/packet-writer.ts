import { encodePacket } from '@/telemetry/sources/ubx/packet-writer';
import {
  DATA_MESSAGE_CLASS,
  CONFIG_MESSAGE_ID,
} from '@/telemetry/sources/racebox/constants';

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
