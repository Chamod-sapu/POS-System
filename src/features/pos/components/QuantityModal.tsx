import React, { useState, useEffect, useRef } from 'react';
import { Scale } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { POSProduct } from '../types';
import { formatLKR } from '../../../lib/money';

export interface QuantityModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: POSProduct | null;
  onConfirm: (quantity: number) => void;
}

export const QuantityModal: React.FC<QuantityModalProps> = ({
  isOpen,
  onClose,
  product,
  onConfirm,
}) => {
  const [qtyStr, setQtyStr] = useState('1.000');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && product) {
      setQtyStr('1.000');
      setError(null);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, product]);

  if (!product) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const qty = parseFloat(qtyStr);
    if (isNaN(qty) || qty <= 0) {
      setError('Please enter a valid positive quantity.');
      return;
    }

    const availableStock = Number(product.stock_qty);
    if (qty > availableStock) {
      setError(`Cannot add ${qty} ${product.unit}. Only ${availableStock} ${product.unit} in stock.`);
      return;
    }

    onConfirm(qty);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Enter Weighed Quantity"
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-600 text-white rounded-lg">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-sm text-slate-900">{product.name}</div>
            <div className="text-xs text-slate-500">
              {formatLKR(product.selling_price_cents)} per {product.unit} • In Stock:{' '}
              <span className="font-semibold text-emerald-800">
                {product.stock_qty} {product.unit}
              </span>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Quantity / Weight ({product.unit})
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              value={qtyStr}
              onChange={(e) => {
                setQtyStr(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              className="w-full text-2xl font-mono font-bold text-center py-2.5 px-4 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="0.000"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
              {product.unit}
            </span>
          </div>
          {error && <p className="text-xs text-rose-600 font-semibold mt-1.5">{error}</p>}
        </div>

        {/* Quick Weight Presets */}
        {product.unit === 'kg' && (
          <div className="grid grid-cols-4 gap-2 pt-1">
            {['0.250', '0.500', '1.000', '2.000'].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setQtyStr(preset);
                  inputRef.current?.focus();
                }}
                className="py-1.5 text-xs font-semibold bg-slate-100 hover:bg-emerald-100 hover:text-emerald-800 rounded-lg transition-colors"
              >
                {parseFloat(preset) * 1000}g
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end space-x-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel (Esc)
          </Button>
          <Button variant="primary" type="submit">
            Add to Cart (Enter)
          </Button>
        </div>
      </form>
    </Modal>
  );
};

