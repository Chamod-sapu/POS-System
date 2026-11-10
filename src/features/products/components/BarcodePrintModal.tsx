import React, { useState } from 'react';
import { Printer, Plus, Minus } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Barcode128 } from '../../../lib/barcode128';
import { ProductWithCategory } from '../types';
import { formatLKR } from '../../../lib/money';
import { useShopSettings } from '../../settings/hooks/useShopSettings';

export interface BarcodePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductWithCategory[];
}

export const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({
  isOpen,
  onClose,
  products,
}) => {
  const { shopName } = useShopSettings();
  // Map of product ID to label count
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    products.forEach((p) => {
      initial[p.id] = 4; // Default 4 labels per product
    });
    return initial;
  });

  const updateCount = (productId: string, delta: number) => {
    setCounts((prev) => {
      const current = prev[productId] ?? 1;
      const next = Math.max(1, current + delta);
      return { ...prev, [productId]: next };
    });
  };

  const handlePrint = () => {
    window.print();
  };

  // Build the list of labels to print
  const labelsToPrint: { product: ProductWithCategory; index: number }[] = [];
  products.forEach((prod) => {
    const qty = counts[prod.id] ?? 1;
    for (let i = 0; i < qty; i++) {
      labelsToPrint.push({ product: prod, index: i });
    }
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Print Barcode Labels"
      description="Configure label quantities and print barcode stickers on standard adhesive sheets"
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} className="no-print">
            Close
          </Button>
          <Button
            variant="primary"
            leftIcon={<Printer className="w-4 h-4" />}
            onClick={handlePrint}
            className="no-print"
          >
            Print {labelsToPrint.length} Labels
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Quantity Controls (hidden on print) */}
        <div className="no-print bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Selected Products & Label Counts
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto">
            {products.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg text-xs"
              >
                <div className="truncate mr-2">
                  <div className="font-semibold text-slate-900 truncate">{p.name}</div>
                  <div className="font-mono text-slate-400 text-[11px]">{p.barcode || p.sku}</div>
                </div>
                <div className="flex items-center space-x-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => updateCount(p.id, -1)}
                    className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
                    aria-label="Decrease labels"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-6 text-center font-mono font-bold">{counts[p.id] ?? 1}</span>
                  <button
                    type="button"
                    onClick={() => updateCount(p.id, 1)}
                    className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
                    aria-label="Increase labels"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Printable Label Grid */}
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-100/50 max-h-[500px] overflow-y-auto print:max-h-none print:p-0 print:border-none print:bg-transparent">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 print:grid-cols-3 print:gap-2">
            {labelsToPrint.map(({ product, index }) => {
              const barcodeValue = product.barcode || product.sku;

              return (
                <div
                  key={`${product.id}-${index}`}
                  className="bg-white border border-slate-300 rounded-lg p-3 text-center flex flex-col items-center justify-between shadow-sm min-h-[140px] print:border-slate-400 print:shadow-none print:rounded-none print:break-inside-avoid"
                >
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate w-full">
                    {shopName}
                  </div>
                  <div className="text-xs font-bold text-slate-900 line-clamp-1 mt-0.5 w-full">
                    {product.name}
                  </div>

                  {/* Sharp Code128 SVG Barcode */}
                  <div className="my-1.5 flex justify-center w-full">
                    <Barcode128
                      value={barcodeValue}
                      height={36}
                      barWidth={1.2}
                      showText={true}
                    />
                  </div>

                  <div className="text-sm font-mono font-extrabold text-slate-900">
                    {formatLKR(product.selling_price_cents)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
};

