import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import id from './locales/id.json'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'
import es from './locales/es.json'

export const SUPPORTED_LANGUAGES = [
  { code: 'id', label: 'Bahasa Indonesia', short: 'ID' },
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'zh-CN', label: '简体中文', short: '中' },
  { code: 'es', label: 'Español', short: 'ES' },
] as const

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code']

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      id: { translation: id },
      en: { translation: en },
      'zh-CN': { translation: zhCN },
      es: { translation: es },
    },
    fallbackLng: 'id',
    // For non-region codes like "zh", fall back to "zh-CN" before "id".
    nonExplicitSupportedLngs: true,
    supportedLngs: ['id', 'en', 'zh-CN', 'es'],
    interpolation: { escapeValue: false },
    detection: {
      // Prefer explicit user choice, then browser language. Persist back to
      // localStorage so the choice survives reload.
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'videoconf.lang',
      caches: ['localStorage'],
    },
    returnNull: false,
  })

export default i18n
