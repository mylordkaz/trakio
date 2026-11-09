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
// The vendor doc writes the echo as {A, B, A & B, A ^ B} while calling it the
// same sequence, so either order of the last two bytes is accepted.
export function isHandshakeConfirmed(
  response: Uint8Array,
  readback: Uint8Array | null
): boolean {
  if (!readback || readback.length < HANDSHAKE_RESPONSE_LENGTH) {
    return false;
  }
  if (readback[0] !== response[0] || readback[1] !== response[1]) {
    return false;
  }
  const exactOrder = readback[2] === response[2] && readback[3] === response[3];
  const swappedOrder = readback[2] === response[3] && readback[3] === response[2];
  return exactOrder || swappedOrder;
}
