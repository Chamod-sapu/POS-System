import React, { useState, useMemo } from 'react';
import { Package, Scale } from 'lucide-react';
import { POSProduct } from '../types';
import { Money } from '../../../components/ui/Money';
import { Badge } from '../../../components/ui/Badge';
import { Skeleton } from '../../../components/ui/Skeleton';

export interface ProductGridProps {
  products: POSProduct[];
  isLoading: boolean;
  onSelectProduct: (product: POSProduct) => void;
}

// Generate consistent category color accents
const CATEGORY_ACCENT_COLORS = [
  'border-l-brand-500',
  'border-l-indigo-500',
  'border-l-sky-500',
  'border-l-amber-500',
  'border-l-emerald-500',
  'border-l-purple-500',
  'border-l-rose-500',
];

function getCategoryColor(catId?: string | null): string {
  if (!catId) return 'border-l-brand-500';
  let hash = 0;
  for (let i = 0; i < catId.length; i++) {
    hash = catId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % CATEGORY_ACCENT_COLORS.length;
  return CATEGORY_ACCENT_COLORS[idx]!;
}

export const ProductGrid: React.FC<ProductGridProps> = ({
  products,
  isLoading,
  onSelectProduct,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Extract unique category IDs
  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      if (p.category_id) cats.add(p.category_id);
    });
    return Array.from(cats);
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'all') return products;
    return products.filter((p) => p.category_id === selectedCategory);
  }, [products, selectedCategory]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 p-2">
        {Array.from({ length: 12 }).map((_, idx) => (
          <div
            key={idx}
            className="h-32 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-col justify-between"
          >
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="py-16 text-center text-slate-400 dark:text-slate-500">
        <Package className="w-12 h-12 mx-auto stroke-1 mb-2 text-slate-300 dark:text-slate-600" />
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No active products in catalog</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Please add products in the Inventory module first.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Category Filter Chips */}
      {categories.length > 1 && (
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none select-none">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-subtle whitespace-nowrap cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-brand-600 text-white shadow-subtle'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            All Items ({products.length})
          </button>
          {categories.map((catId) => (
            <button
              key={catId}
              type="button"
              onClick={() => setSelectedCategory(catId)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-subtle whitespace-nowrap cursor-pointer ${
                selectedCategory === catId
                  ? 'bg-brand-600 text-white shadow-subtle'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Category ({products.filter((p) => p.category_id === catId).length})
            </button>
          ))}
        </div>
      )}

      {/* Product Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto max-h-[calc(100vh-230px)] p-1">
        {filteredProducts.map((p) => {
          const stock = Number(p.stock_qty);
          const isOutOfStock = stock <= 0;
          const isLowStock = stock > 0 && stock <= 5;
          const categoryBorder = getCategoryColor(p.category_id);

          return (
            <button
              key={p.id}
              type="button"
              disabled={isOutOfStock}
              onClick={() => onSelectProduct(p)}
              className={`p-3.5 rounded-xl border-t border-r border-b border-l-4 ${categoryBorder} text-left flex flex-col justify-between transition-subtle select-none relative cursor-pointer group shadow-subtle ${
                isOutOfStock
                  ? 'bg-slate-100 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 opacity-40 grayscale cursor-not-allowed'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-brand-500 dark:hover:border-brand-400 hover:shadow-raised active:scale-[0.98]'
              }`}
            >
              {/* Decimal / Scale Indicator */}
              {p.allow_decimal_qty && (
                <div
                  title="Weighable / Decimal quantity (kg)"
                  className="absolute top-2.5 right-2.5 p-1 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 rounded-md shadow-subtle"
                >
                  <Scale className="w-3.5 h-3.5" />
                </div>
              )}

              <div>
                <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 line-clamp-2 pr-5 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                  {p.name}
                </div>
                <div className="font-mono text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                  SKU: {p.sku}
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1">
                <Money size="sm" cents={p.selling_price_cents} />
                <Badge
                  variant={isOutOfStock ? 'stock-out' : isLowStock ? 'stock-low' : 'stock-in'}
                  size="sm"
                  dot
                  pulseDot={isLowStock}
                >
                  {isOutOfStock ? 'Out of stock' : `${stock} ${p.unit}`}
                </Badge>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
