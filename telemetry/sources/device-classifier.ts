import type { DeviceClassification } from '@/telemetry/sources/types';

export type RaceBoxModel = 'mini' | 'micro';

type DeviceRule = {
  namePrefix: string;
  classification: DeviceClassification;
};

const DEVICE_RULES: DeviceRule[] = [
  {
    namePrefix: 'RaceBox Mini S ',
    classification: { sourceType: 'racebox', protocol: 'racebox-binary' },
  },
  {
    namePrefix: 'RaceBox Mini ',
    classification: { sourceType: 'racebox', protocol: 'racebox-binary' },
  },
  {
    namePrefix: 'RaceBox Micro ',
    classification: { sourceType: 'racebox', protocol: 'racebox-binary' },
  },
  {
    // BL-1000GT: QSTARZ1 + serial, no separator.
    namePrefix: 'QSTARZ1',
    classification: { sourceType: 'qstarz', protocol: 'qstarz-ble' },
  },
  {
    // BL-818GT: QSTARZ2 + serial, no separator.
    namePrefix: 'QSTARZ2',
    classification: { sourceType: 'qstarz', protocol: 'qstarz-ble' },
  },
];

export function classifyDevice(name: string): DeviceClassification | null {
  for (const rule of DEVICE_RULES) {
    if (name.startsWith(rule.namePrefix)) {
      return rule.classification;
    }
  }
  return null;
}

// Prefers the Device Info "Model" string (read after connecting) and falls back
// to the advertised name. Only the Micro reports battery as an input voltage;
// Mini and Mini S share the charge-percentage encoding, so they collapse to 'mini'.
export function resolveRaceBoxModel(
  modelString: string | null,
  deviceName: string
): RaceBoxModel {
  const identity = modelString ?? deviceName;
  return identity.includes('Micro') ? 'micro' : 'mini';
}

// The Firmware Revision characteristic is a "major.minor" string, e.g. "3.3".
export function parseFirmwareRevision(
  revision: string | null
): { major: number; minor: number } | null {
  if (!revision) {
    return null;
  }
  const match = revision.match(/(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return { major: Number(match[1]), minor: Number(match[2]) };
}
