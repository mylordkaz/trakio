import {
  classifyDevice,
  resolveRaceBoxModel,
  resolveDragyModel,
  parseFirmwareRevision,
} from '@/telemetry/sources/device-classifier';

describe('classifyDevice', () => {
  it('classifies each RaceBox product name', () => {
    expect(classifyDevice('RaceBox Mini 1234567890')?.sourceType).toBe('racebox');
    expect(classifyDevice('RaceBox Mini S 1234567890')?.sourceType).toBe('racebox');
    expect(classifyDevice('RaceBox Micro 1234567890')?.sourceType).toBe('racebox');
  });

  it('classifies each Qstarz product name', () => {
    expect(classifyDevice('QSTARZ1DVT0003')).toEqual({
      sourceType: 'qstarz',
      protocol: 'qstarz-ble',
    });
    expect(classifyDevice('QSTARZ2DVT00F5')).toEqual({
      sourceType: 'qstarz',
      protocol: 'qstarz-ble',
    });
  });

  it('classifies each Dragy product name', () => {
    for (const name of ['DRG70-1A2B3C', 'DRG70 123456', 'DRGPR-000001', 'DRGLT000042']) {
      expect(classifyDevice(name)).toEqual({ sourceType: 'dragy', protocol: 'dragy-ubx' });
    }
  });

  it('ignores unrelated devices', () => {
    expect(classifyDevice('Some Other Device')).toBeNull();
    expect(classifyDevice('RaceBoxMini')).toBeNull();
    expect(classifyDevice('QSTARZ')).toBeNull();
    expect(classifyDevice('QSTARZ3ABC0001')).toBeNull();
    expect(classifyDevice('DRG')).toBeNull();
    expect(classifyDevice('DRG71-000001')).toBeNull();
    expect(classifyDevice('dragy')).toBeNull();
  });
});

describe('resolveDragyModel', () => {
  it('tells the Lite and Pro apart from the DRG70 by prefix', () => {
    expect(resolveDragyModel('DRGLT000042')).toBe('drglt');
    expect(resolveDragyModel('DRGPR-000001')).toBe('drgpr');
    expect(resolveDragyModel('DRG70-1A2B3C')).toBe('drg70');
  });
});

describe('resolveRaceBoxModel', () => {
  it('prefers the device-info model string', () => {
    expect(resolveRaceBoxModel('RaceBox Micro', 'RaceBox Mini 123')).toBe('micro');
    expect(resolveRaceBoxModel('RaceBox Mini S', 'RaceBox Micro 123')).toBe('mini');
  });

  it('falls back to the advertised name', () => {
    expect(resolveRaceBoxModel(null, 'RaceBox Micro 123')).toBe('micro');
    expect(resolveRaceBoxModel(null, 'RaceBox Mini S 123')).toBe('mini');
  });
});

describe('parseFirmwareRevision', () => {
  it('parses a major.minor string', () => {
    expect(parseFirmwareRevision('3.3')).toEqual({ major: 3, minor: 3 });
    expect(parseFirmwareRevision('2.6')).toEqual({ major: 2, minor: 6 });
  });

  it('returns null for missing or malformed values', () => {
    expect(parseFirmwareRevision(null)).toBeNull();
    expect(parseFirmwareRevision('garbage')).toBeNull();
  });
});
