import { buildHandshakeResponse, isHandshakeConfirmed } from '@/telemetry/sources/dragy/handshake';

describe('buildHandshakeResponse', () => {
  it('answers {A, B} with {A, B, A ^ B, A & B}', () => {
    const response = buildHandshakeResponse(Uint8Array.from([0xa5, 0x3c]));
    expect(Array.from(response!)).toEqual([0xa5, 0x3c, 0xa5 ^ 0x3c, 0xa5 & 0x3c]);
  });

  it('ignores bytes past the two-byte challenge', () => {
    const response = buildHandshakeResponse(Uint8Array.from([0x01, 0x02, 0xff]));
    expect(Array.from(response!)).toEqual([0x01, 0x02, 0x03, 0x00]);
  });

  it('refuses a short challenge', () => {
    expect(buildHandshakeResponse(Uint8Array.from([0x01]))).toBeNull();
    expect(buildHandshakeResponse(new Uint8Array(0))).toBeNull();
  });
});

describe('isHandshakeConfirmed', () => {
  const response = Uint8Array.from([0xa5, 0x3c, 0x99, 0x24]);

  it('accepts an echo of the response', () => {
    expect(isHandshakeConfirmed(response, Uint8Array.from([0xa5, 0x3c, 0x99, 0x24]))).toBe(true);
  });

  it('rejects a missing, short, or different read-back', () => {
    expect(isHandshakeConfirmed(response, null)).toBe(false);
    expect(isHandshakeConfirmed(response, Uint8Array.from([0xa5, 0x3c]))).toBe(false);
    expect(isHandshakeConfirmed(response, Uint8Array.from([0xa5, 0x3c, 0x99, 0x00]))).toBe(false);
  });
});
