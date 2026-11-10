import React, { useEffect, useState } from 'react';
import { useForm, type Resolver, type FieldErrors } from 'react-hook-form';
import {
  X,
  AlertTriangle,
  Package,
  Barcode,
  Lock,
  Plus,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  productFormSchema,
  ProductFormValues,
  ProductWithCategory,
  Category,
} from '../types';
import { createProduct, updateProduct, toggleProductActive } from '../api/products';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { useToast } from '../../../components/ui/Toast';
import { toCents } from '../../../lib/money';
import { mapErrorMessage } from '../../../lib/errors';

// Custom zero-dependency Zod resolver for react-hook-form
const customZodResolver: Resolver<ProductFormValues> = async (values) => {
  const result = productFormSchema.safeParse(values);
  if (result.success) {
    return {
      values: result.data,
      errors: {},
    };
  }

  const errors: Record<string, { type: string; message: string }> = {};
  for (const issue of result.error.issues) {
    const fieldName = issue.path.join('.') as keyof ProductFormValues;
    if (!errors[fieldName as string]) {
      errors[fieldName as string] = {
        type: issue.code,
        message: issue.message,
      };
    }
  }

  return {
    values: {},
    errors: errors as unknown as FieldErrors<ProductFormValues>,
  };
};

export interface ProductDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  productToEdit?: ProductWithCategory | null;
  categories: Category[];
  onOpenCategoriesModal?: () => void;
}

export const ProductDrawer: React.FC<ProductDrawerProps> = ({
  isOpen,
  onClose,
  productToEdit,
  categories,
  onOpenCategoriesModal,
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isEditing = Boolean(productToEdit);

  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form setup with React Hook Form + Zod
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: customZodResolver,
    defaultValues: {
      sku: '',
      barcode: '',
      name: '',
      category_id: categories[0]?.id || '',
      unit: 'pcs',
      allow_decimal_qty: false,
      cost_price_rupees: '0.00',
      selling_price_rupees: '0.00',
      tax_exempt: false,
      reorder_level: '10',
      track_expiry: false,
      opening_stock_qty: '0',
    },
  });

  const selectedUnit = watch('unit');
  const costPriceRupees = watch('cost_price_rupees');
  const sellingPriceRupees = watch('selling_price_rupees');

  // Auto-enable allow_decimal_qty for weighable/liquid units
  useEffect(() => {
    if (['kg', 'g', 'l', 'ml'].includes(selectedUnit)) {
      setValue('allow_decimal_qty', true);
    } else {
      if (!isEditing) {
        setValue('allow_decimal_qty', false);
      }
    }
  }, [selectedUnit, setValue, isEditing]);

  // Reset form when drawer opens or productToEdit changes
  useEffect(() => {
    if (productToEdit) {
      const costRupees = (Number(productToEdit.cost_price_cents) / 100).toFixed(2);
      const sellingRupees = (Number(productToEdit.selling_price_cents) / 100).toFixed(2);

      reset({
        sku: productToEdit.sku,
        barcode: productToEdit.barcode || '',
        name: productToEdit.name,
        category_id: productToEdit.category_id || categories[0]?.id || '',
        unit: productToEdit.unit as ProductFormValues['unit'],
        allow_decimal_qty: productToEdit.allow_decimal_qty,
        cost_price_rupees: costRupees,
        selling_price_rupees: sellingRupees,
        tax_exempt: productToEdit.tax_exempt,
        reorder_level: String(productToEdit.reorder_level),
        track_expiry: productToEdit.track_expiry,
        opening_stock_qty: '0', // Read-only on edit
      });
    } else {
      reset({
        sku: '',
        barcode: '',
        name: '',
        category_id: categories[0]?.id || '',
        unit: 'pcs',
        allow_decimal_qty: false,
        cost_price_rupees: '0.00',
        selling_price_rupees: '0.00',
        tax_exempt: false,
        reorder_level: '10',
        track_expiry: false,
        opening_stock_qty: '0',
      });
    }
    setFormError(null);
  }, [productToEdit, categories, reset, isOpen]);

  // Calculate gross margin %
  const costNum = parseFloat(costPriceRupees) || 0;
  const sellingNum = parseFloat(sellingPriceRupees) || 0;
  const isLoss = sellingNum > 0 && sellingNum < costNum;
  const marginPercent =
    sellingNum > 0 ? Math.round(((sellingNum - costNum) / sellingNum) * 1000) / 10 : 0;

  // Create Product Mutation
  const createMutation = useMutation({
    mutationFn: (values: ProductFormValues) => {
      return createProduct({
        sku: values.sku,
        barcode: values.barcode || null,
        name: values.name,
        category_id: values.category_id,
        unit: values.unit,
        allow_decimal_qty: values.allow_decimal_qty,
        cost_price_cents: toCents(values.cost_price_rupees),
        selling_price_cents: toCents(values.selling_price_rupees),
        tax_exempt: values.tax_exempt,
        reorder_level: parseFloat(values.reorder_level) || 0,
        track_expiry: values.track_expiry,
        opening_stock_qty: parseFloat(values.opening_stock_qty || '0') || 0,
      });
    },
    onSuccess: (newProd) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock-expiring'] });
      toast.success(`Product "${newProd.name}" (${newProd.sku}) created!`);
      onClose();
    },
    onError: (err) => {
      setFormError(mapErrorMessage(err));
    },
  });

  // Update Product Mutation
  const updateMutation = useMutation({
    mutationFn: (values: ProductFormValues) => {
      if (!productToEdit) throw new Error('No product to edit');
      return updateProduct(productToEdit.id, {
        sku: values.sku,
        barcode: values.barcode || null,
        name: values.name,
        category_id: values.category_id,
        unit: values.unit,
        allow_decimal_qty: values.allow_decimal_qty,
        cost_price_cents: toCents(values.cost_price_rupees),
        selling_price_cents: toCents(values.selling_price_rupees),
        tax_exempt: values.tax_exempt,
        reorder_level: parseFloat(values.reorder_level) || 0,
        track_expiry: values.track_expiry,
      });
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock-expiring'] });
      toast.success(`Product "${updated.name}" updated!`);
      onClose();
    },
    onError: (err) => {
      setFormError(mapErrorMessage(err));
    },
  });

  // Deactivate / Reactivate Mutation
  const toggleActiveMutation = useMutation({
    mutationFn: () => {
      if (!productToEdit) throw new Error('No product to edit');
      return toggleProductActive(productToEdit.id, !productToEdit.is_active);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock-expiring'] });
      toast.success(
        productToEdit?.is_active
          ? 'Product deactivated (hidden from POS search)'
          : 'Product reactivated'
      );
      setConfirmDeactivateOpen(false);
      onClose();
    },
    onError: (err) => {
      setFormError(mapErrorMessage(err));
    },
  });

  const onSubmit = (values: ProductFormValues) => {
    setFormError(null);
    if (isEditing) {
      updateMutation.mutate(values);
    } else {
      createMutation.mutate(values);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over Drawer Panel */}
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col z-10 border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-brand-600 text-white rounded-xl shadow-2xs">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {isEditing ? `Edit Product: ${productToEdit?.sku}` : 'Add New Retail Product'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isEditing ? 'Update pricing & catalog specifications' : 'Create a new catalog item'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Form Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto p-6 space-y-6">
          {formError && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 rounded-xl text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Section 1: Identification */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 pb-1 border-b border-slate-200 dark:border-slate-800">
              Basic Identification
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Input
                  label="SKU (Unique Code) *"
                  placeholder="e.g. RICE-SAMBA-01"
                  error={errors.sku?.message}
                  {...register('sku')}
                />
              </div>
              <div>
                <Input
                  label="Barcode (UPC / EAN)"
                  placeholder="e.g. 4792025000123"
                  leftIcon={<Barcode className="w-4 h-4" />}
                  error={errors.barcode?.message}
                  {...register('barcode')}
                />
              </div>
            </div>

            <div>
              <Input
                label="Product Full Name *"
                placeholder="e.g. Keeri Samba Rice (Loose)"
                error={errors.name?.message}
                {...register('name')}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Category *
                  </label>
                  {onOpenCategoriesModal && (
                    <button
                      type="button"
                      onClick={onOpenCategoriesModal}
                      className="text-[11px] font-semibold text-emerald-600 hover:underline inline-flex items-center"
                    >
                      <Plus className="w-3 h-3 mr-0.5" /> Manage
                    </button>
                  )}
                </div>
                <Select error={errors.category_id?.message} {...register('category_id')}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Select
                  label="Sales Unit *"
                  error={errors.unit?.message}
                  {...register('unit')}
                >
                  <option value="pcs">Pieces (pcs)</option>
                  <option value="kg">Kilograms (kg)</option>
                  <option value="g">Grams (g)</option>
                  <option value="l">Liters (l)</option>
                  <option value="ml">Milliliters (ml)</option>
                  <option value="pack">Pack</option>
                  <option value="box">Box</option>
                </Select>
              </div>
            </div>
          </div>

          {/* Section 2: Pricing & Margin */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 pb-1 border-b border-slate-200">
              Pricing & Costing
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Input
                  label="Cost Price (Rs.)"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  error={errors.cost_price_rupees?.message}
                  {...register('cost_price_rupees')}
                />
              </div>
              <div>
                <Input
                  label="Selling Price (Rs.) *"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  error={errors.selling_price_rupees?.message}
                  {...register('selling_price_rupees')}
                />
              </div>
            </div>

            {/* Profit Margin Preview & Loss Warning */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600 dark:text-slate-400">Calculated Profit Margin:</span>
              <span
                className={`font-mono font-bold text-sm ${
                  isLoss ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {marginPercent}%
              </span>
            </div>

            {isLoss && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-200 text-xs flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Warning:</span> Selling price (Rs. {sellingNum.toFixed(2)})
                  is lower than wholesale cost (Rs. {costNum.toFixed(2)}). You may save this product,
                  but it will sell at a financial loss.
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Stock Management & Controls */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 pb-1 border-b border-slate-200 dark:border-slate-800">
              Stock Rules & Initial Inventory
            </h3>

            {isEditing ? (
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                      Current Stock Level
                    </div>
                    <div className="text-xl font-mono font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                      {productToEdit?.stock_qty} {productToEdit?.unit}
                    </div>
                  </div>
                  <div className="inline-flex items-center text-xs text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-700 px-2.5 py-1 rounded-full font-medium">
                    <Lock className="w-3.5 h-3.5 mr-1" /> Read-Only
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                  Stock cannot be edited directly here to preserve the ledger integrity. Use{' '}
                  <span className="font-semibold text-brand-600 dark:text-brand-400">Inventory Adjustments</span>,
                  purchases, or checkout sales.
                </p>
              </div>
            ) : (
              <div>
                <Input
                  label="Initial Opening Stock Quantity"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.000"
                  helperText="Written directly to the stock ledger as movement type 'opening'."
                  error={errors.opening_stock_qty?.message}
                  {...register('opening_stock_qty')}
                />
              </div>
            )}

            <div>
              <Input
                label="Reorder Alert Threshold"
                type="text"
                inputMode="decimal"
                placeholder="10"
                helperText="Triggers low-stock alerts when stock drops to or below this quantity."
                error={errors.reorder_level?.message}
                {...register('reorder_level')}
              />
            </div>

            {/* Toggle Switches */}
            <div className="space-y-3 pt-2">
              <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors">
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Allow Fractional / Decimal Quantities
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Auto-enabled for weighed goods (kg, g, l, ml)
                  </div>
                </div>
                <input
                  type="checkbox"
                  className="w-4 h-4 text-brand-600 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800 focus:ring-brand-500"
                  {...register('allow_decimal_qty')}
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors">
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Tax Exempt Product</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Excludes this item from shop VAT calculations
                  </div>
                </div>
                <input
                  type="checkbox"
                  className="w-4 h-4 text-brand-600 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800 focus:ring-brand-500"
                  {...register('tax_exempt')}
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors">
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Track Batch Expiry Dates</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Enables FEFO batch allocation and expiry monitoring
                  </div>
                </div>
                <input
                  type="checkbox"
                  className="w-4 h-4 text-brand-600 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800 focus:ring-brand-500"
                  {...register('track_expiry')}
                />
              </label>
            </div>
          </div>

          {/* Drawer Actions */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            {isEditing && (
              <Button
                variant={productToEdit?.is_active ? 'danger' : 'outline'}
                size="sm"
                onClick={() => setConfirmDeactivateOpen(true)}
              >
                {productToEdit?.is_active ? 'Deactivate Product' : 'Reactivate'}
              </Button>
            )}

            <div className="flex items-center space-x-3 ml-auto">
              <Button variant="outline" size="md" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isSubmitting || createMutation.isPending || updateMutation.isPending}
              >
                {isEditing ? 'Save Changes' : 'Create Product'}
              </Button>
            </div>
          </div>
        </form>
      </div>

      {/* Confirmation Dialog for Deactivation */}
      {confirmDeactivateOpen && productToEdit && (
        <ConfirmDialog
          isOpen={confirmDeactivateOpen}
          onClose={() => setConfirmDeactivateOpen(false)}
          onConfirm={() => toggleActiveMutation.mutate()}
          isLoading={toggleActiveMutation.isPending}
          variant={productToEdit.is_active ? 'danger' : 'primary'}
          title={
            productToEdit.is_active
              ? `Deactivate ${productToEdit.name}?`
              : `Reactivate ${productToEdit.name}?`
          }
          message={
            productToEdit.is_active
              ? 'This product will immediately disappear from cashier POS searches and barcode lookups, but will be preserved on all past bills and sales reports.'
              : 'This product will reappear in POS registers and inventory searches.'
          }
          confirmText={productToEdit.is_active ? 'Deactivate' : 'Reactivate'}
        />
      )}
    </div>
  );
};
