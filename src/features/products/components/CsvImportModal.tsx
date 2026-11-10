import React, { useState, useRef } from 'react';
import { Upload, CheckCircle2, AlertCircle, Download } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { Category } from '../types';
import { bulkImportProducts } from '../api/products';
import { toCents } from '../../../lib/money';
import { mapErrorMessage } from '../../../lib/errors';

export interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
}

interface ParsedRow {
  rowNum: number;
  sku: string;
  barcode: string;
  name: string;
  categoryName: string;
  categoryId: string | null;
  unit: string;
  allowDecimal: boolean;
  costPriceRupees: string;
  sellingPriceRupees: string;
  openingStock: string;
  reorderLevel: string;
  taxExempt: boolean;
  trackExpiry: boolean;
  isValid: boolean;
  error?: string;
  warning?: string;
}

// Simple, robust CSV line parser handling quotes
export const parseCSVLine = (text: string): string[] => {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  return result;
};

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  isOpen,
  onClose,
  categories,
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importError, setImportError] = useState<string | null>(null);

  // Generate and download sample CSV template
  const downloadSampleTemplate = () => {
    const defaultCat = categories[0]?.name || 'Grains, Rice & Flour';
    const csvContent =
      'sku,barcode,name,category,unit,cost_price,selling_price,opening_stock,reorder_level,allow_decimal,tax_exempt,track_expiry\n' +
      `RICE-SAMBA-01,4792025000101,Keeri Samba Rice (Loose),${defaultCat},kg,240.00,295.00,50.000,10.000,true,false,true\n` +
      `TEA-CEYLON-02,4792025000102,Dilmah Ceylon Tea 100g,${defaultCat},pack,380.00,450.00,25,5,false,false,true\n`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'wewala_products_sample_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
      if (lines.length < 2) {
        setImportError('CSV file must have a header row and at least one data row.');
        setParsedRows([]);
        return;
      }

      const headers = parseCSVLine(lines[0] || '').map((h) => h.toLowerCase().replace(/[\s_]+/g, ''));
      const getIndex = (name: string) => headers.indexOf(name);

      const idxSku = getIndex('sku');
      const idxBarcode = getIndex('barcode');
      const idxName = getIndex('name');
      const idxCat = getIndex('category');
      const idxUnit = getIndex('unit');
      const idxCost = getIndex('costprice');
      const idxSell = getIndex('sellingprice');
      const idxStock = getIndex('openingstock');
      const idxReorder = getIndex('reorderlevel');

      if (idxSku === -1 || idxName === -1 || idxSell === -1) {
        setImportError('Missing required header columns: sku, name, selling_price');
        setParsedRows([]);
        return;
      }

      const seenSkus = new Set<string>();
      const seenBarcodes = new Set<string>();
      const rows: ParsedRow[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line || line.trim() === '') continue;

        const cols = parseCSVLine(line);
        const sku = (cols[idxSku] || '').trim();
        const barcode = idxBarcode !== -1 ? (cols[idxBarcode] || '').trim() : '';
        const name = (cols[idxName] || '').trim();
        const catStr = idxCat !== -1 ? (cols[idxCat] || '').trim() : '';
        const unit = (idxUnit !== -1 ? cols[idxUnit] || 'pcs' : 'pcs').toLowerCase().trim();
        const costStr = idxCost !== -1 ? cols[idxCost] || '0' : '0';
        const sellStr = cols[idxSell] || '0';
        const stockStr = idxStock !== -1 ? cols[idxStock] || '0' : '0';
        const reorderStr = idxReorder !== -1 ? cols[idxReorder] || '0' : '0';

        // Find Category ID
        const matchedCat = categories.find(
          (c) =>
            c.id.toLowerCase() === catStr.toLowerCase() ||
            c.name.toLowerCase() === catStr.toLowerCase()
        );

        let rowError: string | undefined;
        let rowWarning: string | undefined;

        // Validation
        if (!sku) {
          rowError = 'SKU is required';
        } else if (seenSkus.has(sku.toLowerCase())) {
          rowError = `Duplicate SKU "${sku}" found within file`;
        } else if (!name) {
          rowError = 'Product name is required';
        } else if (!matchedCat) {
          rowError = `Unknown category "${catStr}". Must match existing category.`;
        } else if (!['pcs', 'kg', 'g', 'l', 'ml', 'pack', 'box'].includes(unit)) {
          rowError = `Invalid unit "${unit}". Must be pcs, kg, g, l, ml, pack, or box`;
        } else if (isNaN(parseFloat(sellStr)) || parseFloat(sellStr) < 0) {
          rowError = 'Selling price must be a valid non-negative number';
        } else if (isNaN(parseFloat(costStr)) || parseFloat(costStr) < 0) {
          rowError = 'Cost price must be a valid non-negative number';
        } else if (barcode && seenBarcodes.has(barcode)) {
          rowError = `Duplicate barcode "${barcode}" found within file`;
        } else if (parseFloat(sellStr) < parseFloat(costStr)) {
          rowWarning = 'Selling price is below wholesale cost';
        }

        if (sku) seenSkus.add(sku.toLowerCase());
        if (barcode) seenBarcodes.add(barcode);

        const allowDecimal = ['kg', 'g', 'l', 'ml'].includes(unit);

        rows.push({
          rowNum: i,
          sku,
          barcode,
          name,
          categoryName: matchedCat?.name || catStr || 'Unassigned',
          categoryId: matchedCat?.id || null,
          unit,
          allowDecimal,
          costPriceRupees: costStr,
          sellingPriceRupees: sellStr,
          openingStock: stockStr,
          reorderLevel: reorderStr,
          taxExempt: false,
          trackExpiry: false,
          isValid: !rowError,
          error: rowError,
          warning: rowWarning,
        });
      }

      setParsedRows(rows);
    };

    reader.readAsText(file);
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const payload = parsedRows.map((r) => ({
        sku: r.sku,
        barcode: r.barcode || null,
        name: r.name,
        category_id: r.categoryId as string,
        unit: r.unit,
        allow_decimal_qty: r.allowDecimal,
        cost_price_cents: Number(toCents(r.costPriceRupees)),
        selling_price_cents: Number(toCents(r.sellingPriceRupees)),
        tax_exempt: r.taxExempt,
        reorder_level: parseFloat(r.reorderLevel) || 0,
        track_expiry: r.trackExpiry,
        opening_stock_qty: parseFloat(r.openingStock) || 0,
      }));

      return bulkImportProducts(payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock-expiring'] });
      toast.success(`Successfully imported ${res.imported_count} products!`);
      onClose();
    },
    onError: (err) => {
      setImportError(mapErrorMessage(err));
    },
  });

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const errorCount = parsedRows.filter((r) => !r.isValid).length;
  const canImport = parsedRows.length > 0 && errorCount === 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bulk Product CSV Import"
      description="Upload a CSV file to validate and import products into the catalog in a single transaction"
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={importMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!canImport || importMutation.isPending}
            isLoading={importMutation.isPending}
            onClick={() => importMutation.mutate()}
          >
            {errorCount > 0
              ? `Fix ${errorCount} Errors to Import`
              : `Import All ${validCount} Products`}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Top Controls: Template Download & File Picker */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="flex items-center space-x-3 w-full sm:w-auto">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              variant="secondary"
              size="md"
              leftIcon={<Upload className="w-4 h-4" />}
              onClick={() => fileInputRef.current?.click()}
            >
              Select CSV File
            </Button>
            {fileName && (
              <span className="text-xs font-semibold text-slate-700 truncate max-w-xs">
                {fileName}
              </span>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download className="w-4 h-4" />}
            onClick={downloadSampleTemplate}
          >
            Download CSV Template
          </Button>
        </div>

        {/* Global Error Banner */}
        {importError && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{importError}</span>
          </div>
        )}

        {/* Validation Summary Bar */}
        {parsedRows.length > 0 && (
          <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl text-xs">
            <div className="flex items-center space-x-4">
              <span>
                Total Rows: <strong className="font-mono">{parsedRows.length}</strong>
              </span>
              <span className="text-emerald-700 flex items-center">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Valid: <strong className="font-mono ml-1">{validCount}</strong>
              </span>
              {errorCount > 0 && (
                <span className="text-rose-700 flex items-center">
                  <AlertCircle className="w-3.5 h-3.5 mr-1" />
                  Errors: <strong className="font-mono ml-1">{errorCount}</strong>
                </span>
              )}
            </div>

            {errorCount > 0 && (
              <span className="text-[11px] font-semibold text-rose-600">
                All-or-Nothing Rule: Import disabled until every row passes validation.
              </span>
            )}
          </div>
        )}

        {/* Preview Table */}
        {parsedRows.length > 0 ? (
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm max-h-72 overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Unit</th>
                  <th className="py-2.5 px-3 text-right">Selling (Rs.)</th>
                  <th className="py-2.5 px-3 text-right">Opening Qty</th>
                  <th className="py-2.5 px-3">Validation Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {parsedRows.map((r) => (
                  <tr
                    key={r.rowNum}
                    className={`transition-colors ${
                      r.isValid ? 'hover:bg-slate-50' : 'bg-rose-50/60 hover:bg-rose-50'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono text-slate-400">{r.rowNum}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{r.sku}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900 truncate max-w-xs">
                      {r.name}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{r.categoryName}</td>
                    <td className="py-2.5 px-3 text-slate-500 uppercase">{r.unit}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold">
                      {r.sellingPriceRupees}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                      {r.openingStock}
                    </td>
                    <td className="py-2.5 px-3">
                      {r.isValid ? (
                        <div className="flex items-center space-x-1 text-emerald-700 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Ready</span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1 text-rose-700 font-medium">
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate max-w-xs" title={r.error}>
                            {r.error}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-300 rounded-xl">
            Upload a CSV file to preview rows, validate columns, and batch import products.
          </div>
        )}
      </div>
    </Modal>
  );
};

