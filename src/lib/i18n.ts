import { en, TranslationKey } from './locales/en';

export type SupportedLanguage = 'en' | 'si' | 'ta';

let currentLanguage: SupportedLanguage = 'en';

// Dictionary table mapping language codes to dictionaries
const dictionaries: Record<SupportedLanguage, Record<string, string>> = {
  en: en as Record<string, string>,
  si: {} as Record<string, string>, // Sinhala placeholder for future expansion
  ta: {} as Record<string, string>, // Tamil placeholder for future expansion
};

/**
 * Returns the active language code
 */
export function getLanguage(): SupportedLanguage {
  return currentLanguage;
}

/**
 * Switches the active UI language
 */
export function setLanguage(lang: SupportedLanguage): void {
  currentLanguage = lang;
}

/**
 * Translates a key with optional parameter interpolation.
 * Example: t('nav.pos') or t('error.item', { name: 'Keeri Samba' })
 */
export function t(key: TranslationKey | string, params?: Record<string, string | number>): string {
  const dict = dictionaries[currentLanguage] || dictionaries.en;
  let text = dict[key] || dictionaries.en[key] || key;

  if (params) {
    Object.entries(params).forEach(([paramKey, val]) => {
      text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(val));
    });
  }

  return text;
}

