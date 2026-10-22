import { parsePhoneMount } from '@/services/phone-mount';

jest.mock('expo-sqlite/kv-store', () => ({ Storage: {} }));

describe('parsePhoneMount', () => {
  const mount = { down: { x: 0, y: -0.98, z: -0.2 }, forwardHint: { x: 0, y: 0, z: -1 }, mountYawRad: 1.2 };

  it('round-trips a saved mount', () => {
    expect(parsePhoneMount(JSON.stringify(mount))).toEqual(mount);
  });

  it('rejects missing, corrupt or incomplete values', () => {
    expect(parsePhoneMount(null)).toBeNull();
    expect(parsePhoneMount('{')).toBeNull();
    expect(parsePhoneMount(JSON.stringify({ ...mount, mountYawRad: null }))).toBeNull();
    expect(parsePhoneMount(JSON.stringify({ ...mount, down: { x: 0, y: 1 } }))).toBeNull();
  });
});
