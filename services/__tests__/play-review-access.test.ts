import { isValidPlayReviewCode, sha256Ascii } from '../play-review-access';

describe('Google Play reviewer access', () => {
  it('computes SHA-256 without a native crypto dependency', () => {
    expect(sha256Ascii('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('rejects an incorrect reviewer credential', () => {
    expect(isValidPlayReviewCode('not-the-review-code')).toBe(false);
  });
});
