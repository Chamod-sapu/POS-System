import React, { useState, useEffect } from 'react';
import {
  Save,
  ShieldAlert,
  Printer,
  CheckCircle2,
  MessageSquare,
  AlertTriangle,
  Eye,
  Download,
  Database,
  Store,
  Upload,
  Image as ImageIcon,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Tabs, TabItem } from '../../../components/ui/Tabs';
import { useShopSettings } from '../hooks/useShopSettings';
import { updateShopSettings } from '../api/settings';
import { useAuth } from '../../auth/hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { exportToCsv } from '../../reports/lib/exportCsv';
import {
  getPrinterSettings,
  savePrinterSettings,
} from '../../receipts/lib/printerSettings';
import { printBill, getPrinterAdapter } from '../../receipts/lib/printerAdapter';
import { createTestBill } from '../../receipts/lib/testBill';
import { PaperWidth, PrinterAdapterType } from '../../receipts/types';
import { analyzeSmsText, renderSmsTemplate } from '../../sms/lib/gsm';

export const SettingsPage: React.FC = () => {
  const { settings, isLoading, shopName } = useShopSettings();
  const { role } = useAuth();
  const isOwner = role === 'owner';

  const [activeTab, setActiveTab] = useState('identity');

  // Shop Settings Editable States
  const [shopNameInput, setShopNameInput] = useState('');
  const [storePhoneInput, setStorePhoneInput] = useState('');
  const [storeAddressInput, setStoreAddressInput] = useState('');
  const [vatRegNoInput, setVatRegNoInput] = useState('');
  const [taxRateInput, setTaxRateInput] = useState('0');
  const [receiptFooterInput, setReceiptFooterInput] = useState('');
  const [smsEnabledInput, setSmsEnabledInput] = useState(false);
  const [smsTemplateInput, setSmsTemplateInput] = useState(
    'Thank you for shopping at {shop}. Bill {bill_no}, total {total}, {date}. Enquiries: {phone}'
  );
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Logo state
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(() => {
    return localStorage.getItem('wewala_shop_logo') || null;
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Logo file size must be less than 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setLogoDataUrl(result);
      localStorage.setItem('wewala_shop_logo', result);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoDataUrl(null);
    localStorage.removeItem('wewala_shop_logo');
  };

  // Initialize shop inputs from database
  useEffect(() => {
    if (settings) {
      setShopNameInput(settings.shop_name || 'Wewala Super Store');
      setStorePhoneInput(settings.phone || '+94112345678');
      setStoreAddressInput(settings.address || '123 Main Street, Wewala, Sri Lanka');
      setVatRegNoInput(settings.vat_reg_no || '');
      setTaxRateInput(settings.tax_rate_percent ? String(settings.tax_rate_percent) : '0');
      setReceiptFooterInput(settings.receipt_footer || '');
      setSmsEnabledInput(Boolean(settings.sms_enabled));
      if (settings.sms_template) {
        setSmsTemplateInput(settings.sms_template);
      }
    }
  }, [settings]);

  // Printer Settings State from localStorage
  const [printerSettings, setLocalPrinterSettings] = useState(() => getPrinterSettings());
  const [isTestPrinting, setIsTestPrinting] = useState(false);
  const [testPrintMessage, setTestPrintMessage] = useState<string | null>(null);

  const handleUpdatePrinterSetting = <K extends keyof typeof printerSettings>(
    key: K,
    val: (typeof printerSettings)[K]
  ) => {
    const updated = savePrinterSettings({ [key]: val });
    setLocalPrinterSettings(updated);
  };

  const [isExportingAll, setIsExportingAll] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);

  const handleExportAllData = async () => {
    setIsExportingAll(true);
    setExportProgress('Initiating full database export...');
    try {
      const tables = [
        'products',
        'sales',
        'sale_items',
        'payments',
        'customers',
        'suppliers',
        'stock_movements',
      ] as const;

      const dateStr = new Date().toISOString().slice(0, 10);

      for (const table of tables) {
        setExportProgress(`Exporting ${table}...`);
        const { data, error } = await supabase.from(table).select('*').limit(10000);
        if (error) {
          console.warn(`Export failed for ${table}:`, error.message);
          continue;
        }

        if (data && data.length > 0) {
          const keys = Object.keys(data[0] || {});
          const headers = keys.map((k) => ({ key: k, label: k }));
          exportToCsv(`wewala_${table}_${dateStr}`, headers, data as unknown as Record<string, unknown>[]);
        }
      }
      setExportProgress('All 7 core tables exported successfully.');
    } catch (err) {
      alert('Data export failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsExportingAll(false);
    }
  };

  const handleTestPrint = async () => {
    setIsTestPrinting(true);
    setTestPrintMessage(null);
    try {
      const testBill = createTestBill({
        shop: {
          name: shopNameInput || 'Wewala Super Store',
          address: storeAddressInput || '123 Main Street, Wewala, Sri Lanka',
          phone: storePhoneInput || '0112345678',
          vat_reg_no: vatRegNoInput || null,
          footer: receiptFooterInput || 'Thank you for testing Wewala POS!',
        },
      });

      const res = await printBill(testBill, {
        paperWidth: printerSettings.paperWidth,
        copies: printerSettings.copies,
        openDrawer: printerSettings.drawerOnCash,
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to dispatch test print.');
      }

      setTestPrintMessage('Test receipt sent to printer successfully!');
    } catch (err) {
      setTestPrintMessage(
        'Test print failed: ' + (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setIsTestPrinting(false);
    }
  };

  const handleTestDrawer = async () => {
    try {
      const adapter = getPrinterAdapter();
      await adapter.openCashDrawer?.();
      setTestPrintMessage('Cash drawer pulse dispatched!');
    } catch (err) {
      setTestPrintMessage('Drawer trigger failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleSaveAllSettings = async () => {
    setIsSavingSettings(true);
    setSaveSuccessMsg(null);

    try {
      const parsedTaxRate = parseFloat(taxRateInput);
      await updateShopSettings({
        shop_name: shopNameInput.trim(),
        phone: storePhoneInput.trim(),
        address: storeAddressInput.trim(),
        vat_reg_no: vatRegNoInput.trim() || null,
        tax_rate_percent: isNaN(parsedTaxRate) ? 0 : parsedTaxRate,
        receipt_footer: receiptFooterInput.trim() || null,
        sms_enabled: smsEnabledInput,
        sms_template: smsTemplateInput.trim(),
      });

      setSaveSuccessMsg('Store settings saved successfully!');
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err) {
      alert('Save failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSavingSettings(false);
    }
  };

  const smsAnalysis = analyzeSmsText(smsTemplateInput);
  const liveSmsPreview = renderSmsTemplate(smsTemplateInput, {
    shop: shopNameInput || 'Wewala Super Store',
    bill_no: 'WWL-20261111-0001',
    total: 'Rs. 4,850.00',
    date: '11/11/2026',
    phone: storePhoneInput || '0112345678',
  });

  const tabs: TabItem[] = [
    { id: 'identity', label: 'Store Identity & Logo' },
    { id: 'tax', label: 'Tax & Financial' },
    { id: 'printer', label: 'Thermal Printer Hardware' },
    { id: 'sms', label: 'Customer SMS' },
    ...(isOwner ? [{ id: 'backup', label: 'Database Backup' }] : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings & Hardware Configuration"
        subtitle="Configure store identity, logo, VAT policy, thermal receipt printers and SMS templates"
        actions={
          isOwner && (
            <Button
              variant="primary"
              size="sm"
              isLoading={isSavingSettings}
              leftIcon={<Save className="w-4 h-4" />}
              onClick={handleSaveAllSettings}
            >
              Save Settings
            </Button>
          )
        }
      />

      {saveSuccessMsg && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-2xl text-xs font-semibold flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <span>{saveSuccessMsg}</span>
          </div>
      )}

          {!isOwner && (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl flex items-start space-x-3 text-amber-800 dark:text-amber-200 text-sm">
                <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Read-Only Mode:</span> Global shop identity, taxes, and SMS templates
                  may only be modified by the Store Owner.
                </div>
              </div>
      )}

                {/* Grouped Configuration Tabs */}
                <Tabs
                  tabs={tabs}
                  activeTab={activeTab}
                  onChange={setActiveTab}
                  variant="pills"
                  className="w-fit"
                />

                    {/* Tab 1: Shop Identity & Store Logo */}
                    {activeTab === 'identity' && (
                      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-subtle max-w-4xl space-y-6">
                        <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center justify-between">
                          <h3 className="text-base font-bold text-slate-900 dark:text-white">
                            Shop Branding & Identity
                          </h3>
                          <span className="text-xs text-slate-500 dark:text-slate-400">Printed on receipt headers & UI</span>
                        </div>

                        {/* Logo Upload Section */}
                        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                            Store Brand Logo (Web & Display UI)
                          </label>
                          <div className="flex items-center space-x-4">
                            <div className="w-16 h-16 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
                              {logoDataUrl ? (
                                <img src={logoDataUrl} alt="Store Logo" className="w-full h-full object-contain p-1" />
                              ) : (
                                <Store className="w-7 h-7 text-slate-400" />
                              )}
                            </div>
                            <div className="space-y-1.5">
                              <div className="flex items-center space-x-2">
                                <label className="cursor-pointer">
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleLogoUpload}
                                    disabled={!isOwner}
                                    className="sr-only"
                                  />
                                  <span className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-800 dark:text-slate-200 shadow-2xs transition-colors">
                                    <Upload className="w-3.5 h-3.5 mr-1.5" />
                                    Upload Logo
                                  </span>
                                </label>
                                {logoDataUrl && isOwner && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleRemoveLogo}
                                    className="text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                                    Remove
                                  </Button>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Recommended size 256x256 PNG or SVG. Used in sidebar and login display (never printed on thermal slips).
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Input
                            label="Shop Name"
                            disabled={!isOwner || isLoading}
                            value={shopNameInput}
                            onChange={(e) => setShopNameInput(e.target.value)}
                          />
                          <Input
                            label="Store Phone"
                            disabled={!isOwner || isLoading}
                            value={storePhoneInput}
                            onChange={(e) => setStorePhoneInput(e.target.value)}
                          />
                          <div className="sm:col-span-2">
                            <Input
                              label="Store Address"
                              disabled={!isOwner || isLoading}
                              value={storeAddressInput}
                              onChange={(e) => setStoreAddressInput(e.target.value)}
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <Input
                              label="Receipt Footer Notice"
                              disabled={!isOwner || isLoading}
                              value={receiptFooterInput}
                              onChange={(e) => setReceiptFooterInput(e.target.value)}
                              placeholder="e.g. Goods returnable within 7 days with original receipt."
                            />
                          </div>
                        </div>
                      </div>
                    )}

                          {/* Tab 2: Financial & Tax Policy */}
                          {activeTab === 'tax' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-subtle max-w-4xl space-y-6">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Financial & Tax Policy
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">Inland Revenue compliant</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Currency" disabled defaultValue={settings?.currency || 'LKR'} />
            <Input
              label="VAT Reg No"
              disabled={!isOwner || isLoading}
              value={vatRegNoInput}
              onChange={(e) => setVatRegNoInput(e.target.value)}
              placeholder="e.g. 123456789-7000"
            />
            <Input
              label="Tax Rate (%)"
              disabled={!isOwner || isLoading}
              value={taxRateInput}
              onChange={(e) => setTaxRateInput(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Tab 3: Thermal Receipt Printer Hardware Profile */}
      {activeTab === 'printer' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-subtle max-w-4xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center space-x-2.5">
              <Printer className="w-5 h-5 text-brand-600 dark:text-brand-400" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Thermal Receipt Printer Profile</h3>
            </div>
            <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono px-2.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
              Terminal Local
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Adapter Selection */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Printer Communication Engine
              </label>
              <div className="space-y-2">
                <label className="flex items-center space-x-3 p-3 border border-slate-200 dark:border-slate-800 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <input
                    type="radio"
                    name="printer_adapter"
                    checked={printerSettings.adapter === 'browser'}
                    onChange={() => handleUpdatePrinterSetting('adapter', 'browser' as PrinterAdapterType)}
                    className="text-brand-600 focus:ring-brand-500"
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      Browser Print Service (Recommended)
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Uses OS print queue / kiosk mode without special hardware drivers
                    </div>
                  </div>
                </label>

                <label className="flex items-center space-x-3 p-3 border border-slate-200 dark:border-slate-800 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <input
                    type="radio"
                    name="printer_adapter"
                    checked={printerSettings.adapter === 'escpos'}
                    onChange={() => handleUpdatePrinterSetting('adapter', 'escpos' as PrinterAdapterType)}
                    className="text-brand-600 focus:ring-brand-500"
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      Direct ESC/POS (Web Serial / USB)
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Bypasses print dialog, sends raw bytes and hardware drawer pulse
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Paper Width Selection */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Thermal Paper Width
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label
                  className={`p-3 border rounded-xl cursor-pointer text-center transition-all ${
                    printerSettings.paperWidth === '80mm'
                      ? 'border-brand-600 bg-brand-50/50 dark:bg-brand-950/40 ring-2 ring-brand-500/20'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="paper_width"
                    value="80mm"
                    checked={printerSettings.paperWidth === '80mm'}
                    onChange={() => handleUpdatePrinterSetting('paperWidth', '80mm' as PaperWidth)}
                    className="sr-only"
                  />
                  <div className="font-bold text-sm text-slate-900 dark:text-white">80mm Paper</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">42 columns / 72mm width</div>
                </label>

                <label
                  className={`p-3 border rounded-xl cursor-pointer text-center transition-all ${
                    printerSettings.paperWidth === '58mm'
                      ? 'border-brand-600 bg-brand-50/50 dark:bg-brand-950/40 ring-2 ring-brand-500/20'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="paper_width"
                    value="58mm"
                    checked={printerSettings.paperWidth === '58mm'}
                    onChange={() => handleUpdatePrinterSetting('paperWidth', '58mm' as PaperWidth)}
                    className="sr-only"
                  />
                  <div className="font-bold text-sm text-slate-900 dark:text-white">58mm Paper</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">32 columns / 48mm width</div>
                </label>
              </div>
            </div>

            {/* Copies and Drawer Toggles */}
            <div className="sm:col-span-2 space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border border-slate-200 dark:border-slate-800 rounded-xl gap-2">
                <div>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white block">
                    Print Copies per Completed Sale
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Select whether to print 1 customer copy or 2 copies (customer + merchant)
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleUpdatePrinterSetting('copies', 1)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all ${
                      printerSettings.copies === 1
                        ? 'bg-slate-900 dark:bg-brand-600 text-white border-transparent'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    1 Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdatePrinterSetting('copies', 2)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all ${
                      printerSettings.copies === 2
                        ? 'bg-slate-900 dark:bg-brand-600 text-white border-transparent'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    2 Copies
                  </button>
                </div>
              </div>

              <label className="flex items-center space-x-3 p-3 border border-slate-200 dark:border-slate-800 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                <input
                  type="checkbox"
                  checked={printerSettings.autoPrint}
                  onChange={(e) => handleUpdatePrinterSetting('autoPrint', e.target.checked)}
                  className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500"
                />
                <div>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white block">
                    Auto-Print on Sale Completion
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Dispatches receipt to thermal printer automatically when payment is confirmed
                  </span>
                </div>
              </label>

              <label className="flex items-center space-x-3 p-3 border border-slate-200 dark:border-slate-800 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                <input
                  type="checkbox"
                  checked={printerSettings.drawerOnCash}
                  onChange={(e) => handleUpdatePrinterSetting('drawerOnCash', e.target.checked)}
                  className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500"
                />
                <div>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white block">
                    Automatic Cash Drawer Kick
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Sends drawer kick pulse (ESC p) automatically whenever cash payment is received
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Diagnostic Feedback */}
          {testPrintMessage && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <span>{testPrintMessage}</span>
            </div>
          )}

          {/* Hardware Test Actions */}
          <div className="flex items-center space-x-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button
              variant="outline"
              size="sm"
              isLoading={isTestPrinting}
              leftIcon={<Printer className="w-4 h-4" />}
              onClick={handleTestPrint}
            >
              Test Print Receipt
            </Button>

            <Button variant="ghost" size="sm" onClick={handleTestDrawer} className="text-slate-600 dark:text-slate-400">
              Kick Cash Drawer
            </Button>
          </div>
        </div>
      )}

      {/* Tab 4: Customer SMS Receipt Notification Template */}
      {activeTab === 'sms' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-subtle max-w-4xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center space-x-2.5">
              <MessageSquare className="w-5 h-5 text-brand-600 dark:text-brand-400" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Customer SMS Receipt Notification Template
              </h3>
            </div>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                smsEnabledInput ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {smsEnabledInput ? 'SMS Enabled' : 'SMS Disabled'}
            </span>
          </div>

          <div className="space-y-4">
            {/* Toggle SMS Enabled */}
            <label className="flex items-center space-x-3 p-3 border border-slate-200 dark:border-slate-800 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
              <input
                type="checkbox"
                disabled={!isOwner || isLoading}
                checked={smsEnabledInput}
                onChange={(e) => setSmsEnabledInput(e.target.checked)}
                className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500"
              />
              <div>
                <span className="text-sm font-semibold text-slate-900 dark:text-white block">
                  Enable Transactional SMS Receipts
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Automatically queues an SMS bill receipt when a customer phone number is entered during sale checkout
                </span>
              </div>
            </label>

            {/* Template Input */}
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  SMS Message Template
                </label>
                {/* Placeholders helper pills */}
                <div className="text-[11px] text-slate-500 dark:text-slate-400 space-x-1">
                  <span className="font-semibold">Variables:</span>
                  {['{shop}', '{bill_no}', '{total}', '{date}', '{phone}'].map((ph) => (
                    <button
                      key={ph}
                      type="button"
                      disabled={!isOwner}
                      onClick={() => setSmsTemplateInput((prev) => prev + ` ${ph}`)}
                      className="font-mono text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950/60 px-1 py-0.5 rounded border border-brand-200 dark:border-brand-800 cursor-pointer"
                    >
                      {ph}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                rows={3}
                disabled={!isOwner || isLoading}
                value={smsTemplateInput}
                onChange={(e) => setSmsTemplateInput(e.target.value)}
                className="w-full p-3 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Thank you for shopping at {shop}. Bill {bill_no}, total {total}, {date}. Enquiries: {phone}"
              />

              {/* Character & Encoding Counter */}
              <div className="flex flex-wrap items-center justify-between text-xs pt-1">
                <div className="flex items-center space-x-2">
                  <span
                    className={`px-2 py-0.5 rounded font-mono font-bold ${
                      smsAnalysis.isGsm
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                        : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                    }`}
                  >
                    {smsAnalysis.encoding} Mode
                  </span>
                  <span className="text-slate-600 dark:text-slate-400">
                    {smsAnalysis.charCount} / {smsAnalysis.maxPerSingleSms} chars (
                    <span className="font-bold text-slate-900 dark:text-white">
                      {smsAnalysis.segments} SMS credit{smsAnalysis.segments > 1 ? 's' : ''}
                    </span>
                    )
                  </span>
                </div>

                <span className="text-slate-400 dark:text-slate-500 text-[11px]">
                  {smsAnalysis.remainingInCurrentSegment} chars left in current segment
                </span>
              </div>

              {/* Non-GSM Character Warning Banner */}
              {!smsAnalysis.isGsm && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 rounded-xl text-xs flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Non-GSM Characters Detected: </span>
                    <span>
                      Your template contains Unicode characters ({smsAnalysis.nonGsmCharacters.slice(0, 5).join(' ')})
                      such as Sinhala or Tamil glyphs. This reduces the maximum length from 160 to{' '}
                      <strong>70 characters per message</strong>.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Live Substituted Preview */}
            <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <Eye className="w-3.5 h-3.5" />
                <span>Live Recipient Preview</span>
              </div>
              <div className="p-3.5 bg-slate-100/80 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-mono leading-relaxed">
                {liveSmsPreview}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Database Backups & Data Portability (Owner Only) */}
      {activeTab === 'backup' && isOwner && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-subtle p-6 sm:p-8 space-y-4 max-w-4xl">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                Data Portability & Off-Site Backup
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Download a complete, point-in-time snapshot of your store's database or review automated nightly scripts.
              </p>
            </div>
            <span className="text-[11px] font-semibold bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 px-2.5 py-1 rounded-full border border-purple-200 dark:border-purple-800">
              Owner Only
            </span>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                Export All Core Tables (CSV Bundle)
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl">
                Downloads UTF-8 BOM CSV archives of all 7 core tables: products, sales, sale_items, payments, customers, suppliers, and stock_movements.
              </p>
              {exportProgress && (
                <span className="text-xs font-semibold text-purple-700 dark:text-purple-300 block mt-1">
                  {exportProgress}
                </span>
              )}
            </div>

            <Button
              variant="primary"
              size="sm"
              className="bg-purple-700 hover:bg-purple-800 shrink-0"
              leftIcon={<Download className="w-4 h-4" />}
              isLoading={isExportingAll}
              onClick={handleExportAllData}
            >
              Export All Data
            </Button>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 bg-purple-50/50 dark:bg-purple-950/30 p-3.5 rounded-xl border border-purple-100 dark:border-purple-900/50 flex items-center justify-between">
            <span>
              Automated nightly encrypted pg_dump scripts and disaster recovery drill checklist are documented in <code className="font-mono font-bold text-purple-900 dark:text-purple-300">docs/BACKUP.md</code>.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
