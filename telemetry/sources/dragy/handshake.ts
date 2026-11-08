import {
  HANDSHAKE_CHALLENGE_LENGTH,
  HANDSHAKE_RESPONSE_LENGTH,
} from '@/telemetry/sources/dragy/constants';

// The device publishes {A, B}; it unlocks the stream on {A, B, A ^ B, A & B}.
export function buildHandshakeResponse(challenge: Uint8Array): Uint8Array | null {
  if (challenge.length < HANDSHAKE_CHALLENGE_LENGTH) {
    return null;
  }
  const a = challenge[0];
  const b = challenge[1];
  return Uint8Array.from([a, b, a ^ b, a & b]);
}

// Success is the device echoing the response back on the same characteristic.
export function isHandshakeConfirmed(
  response: Uint8Array,
  readback: Uint8Array | null
): boolean {
  if (!readback || readback.length < HANDSHAKE_RESPONSE_LENGTH) {
    return false;
  }
  for (let i = 0; i < HANDSHAKE_RESPONSE_LENGTH; i++) {
    if (readback[i] !== response[i]) {
      return false;
    }
  }
  return true;
}
