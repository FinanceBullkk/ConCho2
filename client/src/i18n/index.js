import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

// English-only product. The i18n machinery is kept so existing t() calls keep
// working, but there is a single locale (en) — no Vietnamese, no language
// detection, and no runtime language switching.
i18n
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en } },
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'translation',
    interpolation: { escapeValue: false },
  });

export default i18n;
