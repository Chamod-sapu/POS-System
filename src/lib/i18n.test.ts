import { describe, it, expect, beforeEach } from 'vitest';
import { t, setLanguage, getLanguage } from './i18n';

describe('i18n Helper', () => {
  beforeEach(() => {
    setLanguage('en');
  });

  it('translates standard keys from the English dictionary', () => {
    expect(t('nav.pos')).toBe('POS Terminal');
    expect(t('nav.sales')).toBe('Sales & Bills');
    expect(t('status.online')).toBe('Online');
    expect(t('status.offline')).toBe('Offline');
  });

  it('interpolates dynamic variables inside translations', () => {
    // Testing key fallback interpolation
    const interpolated = t('Hello {name}, your total is {amount}', {
      name: 'Kasun',
      amount: 'Rs. 1,250.00',
    });
    expect(interpolated).toBe('Hello Kasun, your total is Rs. 1,250.00');
  });

  it('supports language switching state', () => {
    expect(getLanguage()).toBe('en');
    setLanguage('si');
    expect(getLanguage()).toBe('si');
    // Falls back to English if Sinhala dictionary entry is not yet added
    expect(t('nav.pos')).toBe('POS Terminal');
  });

  it('returns the key itself if not found in dictionary', () => {
    expect(t('nonexistent.translation.key')).toBe('nonexistent.translation.key');
  });
});

