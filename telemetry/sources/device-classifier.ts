import type { TelemetrySampleSource } from '@/telemetry/types';
import type { DeviceClassification } from '@/telemetry/sources/types';

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
];

export function classifyDevice(name: string): DeviceClassification | null {
  for (const rule of DEVICE_RULES) {
    if (name.startsWith(rule.namePrefix)) {
      return rule.classification;
    }
  }
  return null;
}

export function getSupportedNamePrefixes(): string[] {
  return DEVICE_RULES.map((rule) => rule.namePrefix);
}
