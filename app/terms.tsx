import LegalDocumentScreen from '@/components/legal/LegalDocumentScreen';

const TERMS_SECTION_IDS = [
  'overview',
  'safety',
  'accuracy',
  'content',
  'hostedServices',
  'liability',
  'changes',
  'contact',
];

export default function TermsScreen() {
  return (
    <LegalDocumentScreen
      accent="violet"
      sectionIds={TERMS_SECTION_IDS}
      type="terms"
    />
  );
}
