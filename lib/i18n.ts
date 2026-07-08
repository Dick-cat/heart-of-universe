import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import enTranslations from './locales/en.json';
import zhTranslations from './locales/zh.json';

export const LANGUAGES = [
  { code: 'en', label: 'English', labelNative: 'English' },
  { code: 'zh', label: 'Chinese', labelNative: '中文' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

const resources = {
  en: { translation: enTranslations },
  zh: { translation: zhTranslations },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: process.env.NODE_ENV === 'development',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;

export function changeLanguage(lng: LanguageCode) {
  return i18n.changeLanguage(lng);
}
