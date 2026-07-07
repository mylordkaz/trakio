import {
  classifyDevice,
  resolveRaceBoxModel,
  parseFirmwareRevision,
} from '@/telemetry/sources/device-classifier';

describe('classifyDevice', () => {
  it('classifies each RaceBox product name', () => {
    expect(classifyDevice('RaceBox Mini 1234567890')?.sourceType).toBe('racebox');
    expect(classifyDevice('RaceBox Mini S 1234567890')?.sourceType).toBe('racebox');
    expect(classifyDevice('RaceBox Micro 1234567890')?.sourceType).toBe('racebox');
  });

  it('ignores unrelated devices', () => {
    expect(classifyDevice('Some Other Device')).toBeNull();
    expect(classifyDevice('RaceBoxMini')).toBeNull();
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
