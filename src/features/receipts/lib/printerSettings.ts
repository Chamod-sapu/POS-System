import { PrinterSettings } from '../types';

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  adapter: 'browser',
  paperWidth: '80mm',
  copies: 1,
  autoPrint: true,
  drawerOnCash: true,
};

const STORAGE_KEY = 'wewala_printer_settings';

/**
 * Loads configured printer settings from localStorage with safe defaults.
 */
export function getPrinterSettings(): PrinterSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_PRINTER_SETTINGS;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PRINTER_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<PrinterSettings>;
    return {
      adapter: parsed.adapter === 'escpos' ? 'escpos' : 'browser',
      paperWidth: parsed.paperWidth === '58mm' ? '58mm' : '80mm',
      copies: parsed.copies === 2 ? 2 : 1,
      autoPrint: parsed.autoPrint ?? true,
      drawerOnCash: parsed.drawerOnCash ?? true,
    };
  } catch (err) {
    console.warn('Could not read printer settings from localStorage:', err);
    return DEFAULT_PRINTER_SETTINGS;
  }
}

/**
 * Saves printer settings to localStorage.
 */
export function savePrinterSettings(settings: Partial<PrinterSettings>): PrinterSettings {
  const current = getPrinterSettings();
  const updated: PrinterSettings = {
    ...current,
    ...settings,
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to save printer settings:', err);
    }
  }

  return updated;
}

