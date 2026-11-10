import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpDown,
  ClipboardList,
  AlertTriangle,
  History,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SearchInput } from '../../../components/ui/SearchInput';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { StockHistoryModal } from '../../products/components/StockHistoryModal';
import { fetchProducts } from '../../products/api/products';
import { adjustStock, executeStocktake, searchProducts, AdjustSearchProduct } from '../api/adjustments';
import { ProductWithCategory } from '../../products/types';
import { mapErrorMessage } from '../../../lib/errors';
import { useLiveStockStore } from '../useLiveStock';

type InventoryTab = 'single-adjustment' | 'stocktake';

export const InventoryPage: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const recentlyChangedProductIds = useLiveStockStore((s) => s.recentlyChangedProductIds);

  const [activeTab, setActiveTab] = useState<InventoryTab>('single-adjustment');

  // --- SINGLE ADJUSTMENT STATE ---
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<AdjustSearchProduct | ProductWithCategory | null>(null);
  const [qtyChangeStr, setQtyChangeStr] = useState('');
  const [reasonCategory, setReasonCategory] = useState<'damage' | 'expired' | 'theft' | 'counting' | 'other'>('counting');
  const [customNote, setCustomNote] = useState('');
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // --- STOCKTAKE STATE ---
  const [stocktakeSearch, setStocktakeSearch] = useState('');
  const [countedQuantities, setCountedQuantities] = useState<Record<string, string>>({});
  const [showOnlyDiscrepancies, setShowOnlyDiscrepancies] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  // History Modal
  const [historyProduct, setHistoryProduct] = useState<AdjustSearchProduct | ProductWithCategory | null>(null);

  // Search products for single adjustment
  const { data: searchResults = [], isLoading: isSearching } = useQuery({
    queryKey: ['search-products-adjust', productSearch],
    queryFn: () => searchProducts(productSearch),
    enabled: productSearch.trim().length > 0 && !selectedProduct,
  });

  // Query all products for stocktake mode
  const { data: stocktakeData, isLoading: isLoadingStocktake } = useQuery({
    queryKey: ['stocktake-products'],
    queryFn: () => fetchProducts({ showInactive: false }, { page: 1, pageSize: 200 }),
    enabled: activeTab === 'stocktake',
  });

  const allStocktakeProducts = stocktakeData?.products || [];
  const stocktakeProducts = allStocktakeProducts.filter((p) => {
    if (!stocktakeSearch.trim()) return true;
    const q = stocktakeSearch.toLowerCase().trim();
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.toLowerCase().includes(q))
    );
  });

  // Single Adjustment Mutation
  const adjustMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProduct) throw new Error('No product selected');
      const change = parseFloat(qtyChangeStr);
      if (isNaN(change) || change === 0) {
        throw new Error('Please enter a valid non-zero quantity change');
      }

      // Check resulting stock
      const resulting = Number(selectedProduct.stock_qty) + change;
      if (resulting < 0) {
        throw new Error(
          `Adjustment rejected: Resulting stock cannot be negative (would be ${resulting} ${selectedProduct.unit}).`
        );
      }

      // Map reason category to movement_type & detailed note
      let movType: 'adjustment' | 'damage' | 'opening' | 'stocktake' = 'adjustment';
      if (reasonCategory === 'damage') movType = 'damage';

      const fullReason = `${reasonCategory.toUpperCase()}: ${customNote.trim() || 'Manual stock adjustment'}`;

      return adjustStock({
        productId: selectedProduct.id,
        qtyChange: change,
        reason: fullReason,
        type: movType,
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stocktake-products'] });
      toast.success(
        `Stock for ${selectedProduct?.name} updated! (New balance: ${res.new_stock_qty} ${selectedProduct?.unit})`
      );
      setSelectedProduct(null);
      setQtyChangeStr('');
      setCustomNote('');
      setProductSearch('');
      setAdjustError(null);
    },
    onError: (err) => {
      setAdjustError(mapErrorMessage(err));
    },
  });

  // Stocktake Bulk Mutation
  const stocktakeMutation = useMutation({
    mutationFn: async (discrepancies: Array<{ product_id: string; counted_qty: number; note: string }>) => {
      return executeStocktake(discrepancies);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stocktake-products'] });
      toast.success(`Stocktake complete! Reconciled ${res.adjusted_items_count} discrepancy movements.`);
      setConfirmModalOpen(false);
      setCountedQuantities({});
    },
    onError: (err) => {
      toast.error(mapErrorMessage(err));
    },
  });

  // Compute stocktake discrepancies
  const stocktakeDiscrepancies = stocktakeProducts
    .map((p) => {
      const countedStr = countedQuantities[p.id];
      if (countedStr === undefined || countedStr === '') return null;
      const counted = parseFloat(countedStr);
      if (isNaN(counted)) return null;
      const diff = Math.round((counted - Number(p.stock_qty)) * 1000) / 1000;
      if (diff === 0) return null;

      return {
        product: p,
        system_stock: Number(p.stock_qty),
        counted_qty: counted,
        diff,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  // Resulting stock calculation for single adjustment preview
  const enteredQtyChange = parseFloat(qtyChangeStr) || 0;
  const currentStock = selectedProduct ? Number(selectedProduct.stock_qty) : 0;
  const resultingStock = currentStock + enteredQtyChange;
  const isNegativeStock = selectedProduct && resultingStock < 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock & Inventory Control"
        subtitle="Manage product adjustments, damage write-offs, physical stocktake and tamper-evident ledgers"
      />

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-6">
        <button
          type="button"
          onClick={() => setActiveTab('single-adjustment')}
          className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center space-x-2 ${
            activeTab === 'single-adjustment'
              ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <ArrowUpDown className="w-4 h-4" />
          <span>Quick Stock Adjustment</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('stocktake')}
          className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center space-x-2 ${
            activeTab === 'stocktake'
              ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>Physical Stocktake Mode</span>
        </button>
      </div>

      {activeTab === 'single-adjustment' ? (
        /* =================================================================== */
        /* TAB 1: QUICK SINGLE PRODUCT ADJUSTMENT                              */
        /* =================================================================== */
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-subtle space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Adjust Product Stock</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Record shrinkage, damages, counting discrepancies, or expired stock write-offs.
              </p>
            </div>

            {adjustError && (
              <div className="p-4 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 rounded-xl text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{adjustError}</span>
              </div>
            )}

            {/* Step 1: Product Picker */}
            {!selectedProduct ? (
              <div className="space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Search Product by Name, SKU or Scan Barcode
                </label>
                <SearchInput
                  placeholder="Scan barcode or type product name / SKU..."
                  value={productSearch}
                  onChange={(val) => setProductSearch(val)}
                  autoFocus
                />

                {/* Search Results Dropdown */}
                {isSearching ? (
                  <div className="p-4 text-center text-xs text-slate-400 dark:text-slate-500">Searching catalog...</div>
                ) : searchResults.length > 0 ? (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800 overflow-hidden shadow-subtle bg-white dark:bg-slate-900">
                    {searchResults.map((prod) => (
                      <div
                        key={prod.id}
                        onClick={() => {
                          setSelectedProduct(prod);
                          setProductSearch('');
                          setAdjustError(null);
                        }}
                        className="p-3.5 hover:bg-brand-50/50 dark:hover:bg-brand-950/30 cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <div>
                          <div className="font-semibold text-sm text-slate-900 dark:text-white">{prod.name}</div>
                          <div className="font-mono text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                            SKU: {prod.sku} {prod.barcode && `• Barcode: ${prod.barcode}`}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold text-sm text-brand-700 dark:text-brand-300 tabular-nums">
                            {prod.stock_qty} {prod.unit}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">In Stock</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              /* Selected Product Card */
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Selected Product</div>
                  <div className="font-bold text-base text-slate-900 dark:text-white">{selectedProduct.name}</div>
                  <div className="font-mono text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                    SKU: {selectedProduct.sku} {selectedProduct.barcode && `• ${selectedProduct.barcode}`}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<History className="w-3.5 h-3.5" />}
                    onClick={() => setHistoryProduct(selectedProduct)}
                  >
                    History
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedProduct(null);
                      setQtyChangeStr('');
                    }}
                  >
                    Change
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Adjustment Details */}
            {selectedProduct && (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                      Quantity Change (+ or -) *
                    </label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder={selectedProduct.allow_decimal_qty ? 'e.g. -2.500 or +10.000' : 'e.g. -5 or +12'}
                      value={qtyChangeStr}
                      onChange={(e) => setQtyChangeStr(e.target.value)}
                      helperText={
                        selectedProduct.allow_decimal_qty
                          ? `Weighed item (${selectedProduct.unit}): decimals allowed.`
                          : `Discrete item (${selectedProduct.unit}): whole numbers only.`
                      }
                    />
                  </div>

                  <div>
                    <Select
                      label="Adjustment Reason *"
                      value={reasonCategory}
                      onChange={(e) => setReasonCategory(e.target.value as 'damage' | 'expired' | 'theft' | 'counting' | 'other')}
                    >
                      <option value="counting">Counting Discrepancy / Correction</option>
                      <option value="damage">Damaged Goods / Spillage</option>
                      <option value="expired">Expired Stock Disposal</option>
                      <option value="theft">Theft / Shrinkage Loss</option>
                      <option value="other">Other Explanation</option>
                    </Select>
                  </div>
                </div>

                <div>
                  <Input
                    label="Additional Note / Reason Details"
                    placeholder="e.g. Shelf carton damaged during shelf restocking"
                    value={customNote}
                    onChange={(e) => setCustomNote(e.target.value)}
                  />
                </div>

                {/* Stock Projection Card */}
                <div
                  className={`p-4 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                    isNegativeStock
                      ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200'
                      : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-200'
                  }`}
                >
                  <div>
                    <span className="font-semibold uppercase tracking-wider">
                      Current Stock: <span className="tabular-nums font-mono">{currentStock}</span> {selectedProduct.unit}
                    </span>
                    <div className="text-[11px] mt-0.5 opacity-80">
                      Resulting Balance After Adjustment:
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-mono text-xl font-bold tabular-nums">
                      {resultingStock} {selectedProduct.unit}
                    </span>
                    {isNegativeStock && (
                      <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                        Rejected: Cannot result in negative stock.
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2 flex justify-end space-x-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedProduct(null);
                      setQtyChangeStr('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    disabled={
                      !qtyChangeStr ||
                      enteredQtyChange === 0 ||
                      isNegativeStock ||
                      adjustMutation.isPending
                    }
                    isLoading={adjustMutation.isPending}
                    onClick={() => adjustMutation.mutate()}
                  >
                    Apply Adjustment
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* =================================================================== */
        /* TAB 2: PHYSICAL STOCKTAKE MODE                                      */
        /* =================================================================== */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-subtle">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Periodic Physical Stocktake</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Count physical shelf stock. The system calculates discrepancies and records 'stocktake' adjustments.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                value={stocktakeSearch}
                onChange={setStocktakeSearch}
                placeholder="Search items..."
                className="w-48 text-xs"
              />
              <Button
                variant={showOnlyDiscrepancies ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setShowOnlyDiscrepancies(!showOnlyDiscrepancies)}
              >
                {showOnlyDiscrepancies ? 'Discrepancies Only' : 'Show All'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={stocktakeDiscrepancies.length === 0}
                onClick={() => setConfirmModalOpen(true)}
              >
                Review & Apply ({stocktakeDiscrepancies.length})
              </Button>
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-subtle bg-white dark:bg-slate-900">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/90 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider z-10">
                  <tr>
                    <th className="py-3 px-4">SKU / Barcode</th>
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-4 text-right">System Stock</th>
                    <th className="py-3 px-4 text-center w-36">Counted Physical Qty</th>
                    <th className="py-3 px-4 text-right">Discrepancy (Diff)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {isLoadingStocktake ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 dark:text-slate-500">
                        Loading catalog for stocktake...
                      </td>
                    </tr>
                  ) : stocktakeProducts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 dark:text-slate-500">
                        No products found.
                      </td>
                    </tr>
                  ) : (
                    stocktakeProducts
                      .filter((p) => {
                        if (!showOnlyDiscrepancies) return true;
                        const countedStr = countedQuantities[p.id];
                        if (countedStr === undefined || countedStr === '') return false;
                        return parseFloat(countedStr) !== Number(p.stock_qty);
                      })
                      .map((prod) => {
                        const countedStr = countedQuantities[prod.id] ?? '';
                        const hasEntered = countedStr !== '';
                        const countedNum = parseFloat(countedStr) || 0;
                        const diff = hasEntered
                          ? Math.round((countedNum - Number(prod.stock_qty)) * 1000) / 1000
                          : 0;
                        const isJustUpdated = recentlyChangedProductIds.has(prod.id);

                        return (
                          <tr
                            key={prod.id}
                            className={`transition-colors ${
                              isJustUpdated
                                ? 'bg-amber-100/90 dark:bg-amber-950/60 border-l-4 border-l-amber-500 animate-pulse duration-500'
                                : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <td className="py-2.5 px-4 font-mono font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                              {prod.sku}
                            </td>
                            <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                              {prod.name}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                              {prod.stock_qty} {prod.unit}
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder={String(prod.stock_qty)}
                                value={countedStr}
                                onChange={(e) => {
                                  const val = e.target.value.trim();
                                  setCountedQuantities((prev) => ({
                                    ...prev,
                                    [prod.id]: val,
                                  }));
                                }}
                                className="w-28 px-2.5 py-1 text-center font-mono font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-brand-500 outline-none tabular-nums"
                              />
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold tabular-nums">
                              {!hasEntered ? (
                                <span className="text-slate-400 dark:text-slate-500 font-normal">Not counted</span>
                              ) : diff === 0 ? (
                                <Badge variant="success" size="sm">
                                  Matched (0)
                                </Badge>
                              ) : diff > 0 ? (
                                <Badge variant="info" size="sm">
                                  +{diff} {prod.unit}
                                </Badge>
                              ) : (
                                <Badge variant="danger" size="sm">
                                  {diff} {prod.unit}
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stocktake Confirmation Modal */}
          {confirmModalOpen && (
            <Modal
              isOpen={confirmModalOpen}
              onClose={() => setConfirmModalOpen(false)}
              title="Confirm Stocktake Adjustments"
              description="The following discrepancies will be permanently logged to the stock ledger as 'stocktake' adjustments."
              size="lg"
              footer={
                <>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmModalOpen(false)}
                    disabled={stocktakeMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    isLoading={stocktakeMutation.isPending}
                    onClick={() => {
                      const payload = stocktakeDiscrepancies.map((d) => ({
                        product_id: d.product.id,
                        counted_qty: d.counted_qty,
                        note: `Physical Stocktake Count: Counted ${d.counted_qty} vs System ${d.system_stock}`,
                      }));
                      stocktakeMutation.mutate(payload);
                    }}
                  >
                    Confirm & Apply {stocktakeDiscrepancies.length} Adjustments
                  </Button>
                </>
              }
            >
              <div className="space-y-4 max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-800 font-bold uppercase text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="p-2.5">Product</th>
                      <th className="p-2.5 text-right">System</th>
                      <th className="p-2.5 text-right">Counted</th>
                      <th className="p-2.5 text-right">Difference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {stocktakeDiscrepancies.map((d) => (
                      <tr key={d.product.id}>
                        <td className="p-2.5 font-semibold text-slate-900 dark:text-white">{d.product.name}</td>
                        <td className="p-2.5 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums">{d.system_stock}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                          {d.counted_qty}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold tabular-nums">
                          <span className={d.diff > 0 ? 'text-brand-600 dark:text-brand-400' : 'text-rose-600 dark:text-rose-400'}>
                            {d.diff > 0 ? `+${d.diff}` : d.diff} {d.product.unit}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* Stock History Modal */}
      {historyProduct && (
        <StockHistoryModal
          isOpen={Boolean(historyProduct)}
          onClose={() => setHistoryProduct(null)}
          product={historyProduct}
        />
      )}
    </div>
  );
};

export default InventoryPage;
