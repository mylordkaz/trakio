import { I18n } from 'i18n-js';
import { getLocales } from 'expo-localization';
import en from './locales/en';
import ja from './locales/ja';

const i18n = new I18n({ en, ja });

i18n.locale = getLocales()[0]?.languageCode ?? 'en';
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

export default i18n;
