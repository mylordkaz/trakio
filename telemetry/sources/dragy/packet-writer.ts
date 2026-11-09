import { encodePacket } from '@/telemetry/sources/ubx/packet-writer';
import { CFG_CLASS, CFG_VALGET_ID, CFG_VALSET_ID } from '@/telemetry/sources/ubx/constants';
import {
  PERFORMANCE_MODE_QUERY_PAYLOAD,
  VALGET_VERSION,
  VALGET_LAYER_RAM,
  VALSET_VERSION,
  VALSET_LAYERS_RAM_BBR,
  CFG_RATE_MEAS_KEY,
  FOUR_GNSS_SIGNALS,
} from '@/telemetry/sources/dragy/constants';

function keyBytes(key: number): number[] {
  return [key & 0xff, (key >>> 8) & 0xff, (key >>> 16) & 0xff, (key >>> 24) & 0xff];
}

export function encodePerformanceModeQuery(): Uint8Array {
  return encodePacket(CFG_CLASS, CFG_VALGET_ID, PERFORMANCE_MODE_QUERY_PAYLOAD);
}

export function encodeFourGnssConfig(): Uint8Array {
  const payload = [VALSET_VERSION, VALSET_LAYERS_RAM_BBR, 0x00, 0x00];
  for (const signal of FOUR_GNSS_SIGNALS) {
    payload.push(...keyBytes(signal.key), signal.enabled ? 0x01 : 0x00);
  }
  return encodePacket(CFG_CLASS, CFG_VALSET_ID, Uint8Array.from(payload));
}

export function encodeRateQuery(): Uint8Array {
  const payload = [VALGET_VERSION, VALGET_LAYER_RAM, 0x00, 0x00, ...keyBytes(CFG_RATE_MEAS_KEY)];
  return encodePacket(CFG_CLASS, CFG_VALGET_ID, Uint8Array.from(payload));
}

export function encodeRateConfig(periodMs: number): Uint8Array {
  const payload = [
    VALSET_VERSION,
    VALSET_LAYERS_RAM_BBR,
    0x00,
    0x00,
    ...keyBytes(CFG_RATE_MEAS_KEY),
    periodMs & 0xff,
    (periodMs >> 8) & 0xff,
  ];
  return encodePacket(CFG_CLASS, CFG_VALSET_ID, Uint8Array.from(payload));
}
