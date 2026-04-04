import LegalDocumentScreen from '@/components/legal/LegalDocumentScreen';

const PRIVACY_SECTION_IDS = [
  'overview',
  'localData',
  'permissions',
  'networkServices',
  'sharing',
  'retention',
  'contact',
];

export default function PrivacyScreen() {
  return (
    <LegalDocumentScreen
      accent="sky"
      sectionIds={PRIVACY_SECTION_IDS}
      type="privacy"
    />
  );
}
