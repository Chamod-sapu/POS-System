import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Plus,
  Tag,
  Printer,
  Upload,
  History,
  Edit,
  AlertTriangle,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SearchInput } from '../../../components/ui/SearchInput';
import { Button } from '../../../components/ui/Button';
import { DataTable, Column } from '../../../components/ui/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { Money } from '../../../components/ui/Money';
import { ProductDrawer } from '../components/ProductDrawer';
import { CategoryModal } from '../components/CategoryModal';
import { StockHistoryModal } from '../components/StockHistoryModal';
import { BarcodePrintModal } from '../components/BarcodePrintModal';
import { CsvImportModal } from '../components/CsvImportModal';
import { LowStockExpiryPanel } from '../components/LowStockExpiryPanel';
import { fetchProducts, fetchCategories } from '../api/products';
import { ProductWithCategory } from '../types';
import { formatLKR } from '../../../lib/money';
import { useLiveStockStore } from '../../inventory/useLiveStock';

type ActiveTab = 'products' | 'low-stock';

export const ProductsPage: React.FC = () => {
  const recentlyChangedProductIds = useLiveStockStore((s) => s.recentlyChangedProductIds);

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<ActiveTab>('products');

  // Search, filter, sorting and server pagination state
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [outOfStockOnly, setOutOfStockOnly] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const sortColumn = 'name';
  const sortDirection: 'asc' | 'desc' = 'asc';

  // Modal / Drawer states
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductWithCategory | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [historyProduct, setHistoryProduct] = useState<ProductWithCategory | null>(null);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [barcodePrintOpen, setBarcodePrintOpen] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  // Query categories
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  });

  // Query products with server-side pagination (25 per page)
  const { data: productsData, isLoading } = useQuery({
    queryKey: [
      'products',
      { search, categoryId, lowStockOnly, outOfStockOnly, showInactive, page, sortColumn, sortDirection },
    ],
    queryFn: () =>
      fetchProducts(
        {
          search,
          categoryId: categoryId || undefined,
          lowStockOnly,
          outOfStockOnly,
          showInactive,
        },
        {
          page,
          pageSize: 25,
          sortColumn,
          sortDirection,
        }
      ),
  });

  const products = productsData?.products || [];
  const totalCount = productsData?.totalCount || 0;

  // Toggle selection for barcode labels
  const toggleSelect = (id: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedProductIds.size === products.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(products.map((p) => p.id)));
    }
  };

  const selectedProductsForPrint = products.filter((p) => selectedProductIds.has(p.id));

  // Table Columns
  const columns: Column<ProductWithCategory>[] = [
    {
      id: 'select',
      header: (
        <input
          type="checkbox"
          checked={products.length > 0 && selectedProductIds.size === products.length}
          onChange={toggleSelectAll}
          className="w-4 h-4 text-brand-600 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800 focus:ring-brand-500"
          aria-label="Select all products on page"
        />
      ),
      width: '40px',
      accessor: (row) => (
        <input
          type="checkbox"
          checked={selectedProductIds.has(row.id)}
          onChange={(e) => {
            e.stopPropagation();
            toggleSelect(row.id);
          }}
          className="w-4 h-4 text-brand-600 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800 focus:ring-brand-500"
          aria-label={`Select ${row.name}`}
        />
      ),
    },
    {
      id: 'sku',
      header: 'SKU / Barcode',
      sortable: true,
      accessor: (row) => (
        <div>
          <div className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">{row.sku}</div>
          {row.barcode && (
            <div className="font-mono text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">{row.barcode}</div>
          )}
        </div>
      ),
    },
    {
      id: 'name',
      header: 'Product Name',
      sortable: true,
      accessor: (row) => (
        <div>
          <span className="font-semibold text-slate-900 dark:text-slate-100">{row.name}</span>
          <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500">({row.unit})</span>
          {row.tax_exempt && (
            <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded font-medium border border-slate-200 dark:border-slate-700">
              Tax Exempt
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'category',
      header: 'Category',
      accessor: (row) => (
        <span className="text-slate-600 dark:text-slate-300 text-xs font-medium">
          {row.category?.name || 'Unassigned'}
        </span>
      ),
    },
    {
      id: 'cost_price_cents',
      header: 'Cost Price',
      align: 'right',
      sortable: true,
      accessor: (row) => (
        <div className="text-right">
          <Money cents={row.cost_price_cents} size="sm" className="text-slate-500 dark:text-slate-400" />
        </div>
      ),
    },
    {
      id: 'selling_price_cents',
      header: 'Selling Price',
      align: 'right',
      sortable: true,
      accessor: (row) => (
        <div className="text-right">
          <Money cents={row.selling_price_cents} size="sm" className="font-bold text-slate-900 dark:text-white" />
        </div>
      ),
    },
    {
      id: 'margin',
      header: 'Margin %',
      align: 'right',
      accessor: (row) => {
        const cost = Number(row.cost_price_cents);
        const sell = Number(row.selling_price_cents);
        if (sell <= 0) return <span className="font-mono text-xs text-slate-400">0%</span>;
        const margin = Math.round(((sell - cost) / sell) * 100);
        const isLoss = margin < 0;

        return (
          <span
            className={`font-mono font-bold text-xs tabular-nums ${
              isLoss ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {margin}%
          </span>
        );
      },
    },
    {
      id: 'stock_qty',
      header: 'Stock Level',
      align: 'right',
      sortable: true,
      accessor: (row) => {
        const qty = Number(row.stock_qty);
        const reorder = Number(row.reorder_level);
        const isLow = qty <= reorder;
        const isOut = qty <= 0;
        const isJustUpdated = recentlyChangedProductIds.has(row.id);

        let stockVariant: 'stock-in' | 'stock-low' | 'stock-out' = 'stock-in';
        if (isOut) stockVariant = 'stock-out';
        else if (isLow) stockVariant = 'stock-low';

        return (
          <div className="text-right flex items-center justify-end space-x-1.5">
            {isJustUpdated && (
              <span className="text-[10px] font-bold text-brand-700 dark:text-brand-300 bg-brand-100 dark:bg-brand-950/60 border border-brand-300 dark:border-brand-800 px-1 rounded animate-pulse">
                Live
              </span>
            )}
            <Badge variant={stockVariant} size="sm">
              <span className="tabular-nums font-mono font-bold">{row.stock_qty}</span>
              <span className="ml-1 text-[10px] opacity-75">{row.unit}</span>
            </Badge>
          </div>
        );
      },
    },
    {
      id: 'reorder_level',
      header: 'Reorder',
      align: 'right',
      accessor: (row) => (
        <span className="font-mono text-xs text-slate-400 dark:text-slate-500 tabular-nums">{row.reorder_level}</span>
      ),
    },
    {
      id: 'is_active',
      header: 'Status',
      accessor: (row) => (
        <Badge variant={row.is_active ? 'success' : 'neutral'} size="sm">
          {row.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      accessor: (row) => (
        <div className="flex items-center justify-end space-x-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            title="View stock history ledger"
            onClick={() => setHistoryProduct(row)}
            className="p-1.5 text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Edit product catalog specifications"
            onClick={() => {
              setEditingProduct(row);
              setDrawerOpen(true);
            }}
            className="p-1.5 text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Edit className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Products & Inventory Catalog"
        subtitle="Server-paginated catalog management, wholesale costing, price tags and barcode printing"
        actions={
          <div className="flex items-center space-x-2 flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Tag className="w-4 h-4" />}
              onClick={() => setCategoryModalOpen(true)}
            >
              Categories
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Upload className="w-4 h-4" />}
              onClick={() => setCsvImportOpen(true)}
            >
              Import CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Printer className="w-4 h-4" />}
              disabled={selectedProductsForPrint.length === 0}
              onClick={() => setBarcodePrintOpen(true)}
            >
              Print Labels ({selectedProductsForPrint.length})
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => {
                setEditingProduct(null);
                setDrawerOpen(true);
              }}
            >
              New Product
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-6">
        <button
          type="button"
          onClick={() => setActiveTab('products')}
          className={`pb-3 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'products'
              ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          All Catalog Products ({totalCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('low-stock')}
          className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center space-x-1.5 ${
            activeTab === 'low-stock'
              ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span>Low Stock & Expiry Alerts</span>
        </button>
      </div>

      {activeTab === 'products' ? (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-subtle flex flex-col lg:flex-row gap-3">
            <div className="flex-1">
              <SearchInput
                placeholder="Search products by SKU, name, or barcode (press '/' to focus)..."
                value={search}
                onChange={(val) => {
                  setSearch(val);
                  setPage(1);
                }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Category Filter */}
              <select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              {/* Quick Filter Buttons */}
              <button
                type="button"
                onClick={() => {
                  setLowStockOnly(!lowStockOnly);
                  setOutOfStockOnly(false);
                  setPage(1);
                }}
                className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-colors ${
                  lowStockOnly
                    ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                }`}
              >
                Low Stock
              </button>

              <button
                type="button"
                onClick={() => {
                  setOutOfStockOnly(!outOfStockOnly);
                  setLowStockOnly(false);
                  setPage(1);
                }}
                className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-colors ${
                  outOfStockOnly
                    ? 'bg-rose-100 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                }`}
              >
                Out of Stock
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowInactive(!showInactive);
                  setPage(1);
                }}
                className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-colors ${
                  showInactive
                    ? 'bg-purple-100 dark:bg-purple-950/60 border-purple-300 dark:border-purple-800 text-purple-800 dark:text-purple-300'
                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                }`}
              >
                {showInactive ? 'Showing Inactive' : 'Active Only'}
              </button>
            </div>
          </div>

          {/* Server-Paginated Data Table (25 per page) */}
          <DataTable<ProductWithCategory>
            data={products}
            columns={columns}
            keyExtractor={(p) => p.id}
            isLoading={isLoading}
            pageSize={25}
            rowClassName={(p) =>
              recentlyChangedProductIds.has(p.id)
                ? 'bg-amber-100/90 border-l-4 border-l-amber-500 animate-pulse transition-all duration-300'
                : ''
            }
            emptyTitle="No Products Match Filters"
            emptyDescription="Try clearing filters or search keywords to view products."
          />
        </div>
      ) : (
        <LowStockExpiryPanel />
      )}

      {/* Add / Edit Product Drawer */}
      {drawerOpen && (
        <ProductDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          productToEdit={editingProduct}
          categories={categories}
          onOpenCategoriesModal={() => setCategoryModalOpen(true)}
        />
      )}

      {/* Categories Inline Management Modal */}
      {categoryModalOpen && (
        <CategoryModal
          isOpen={categoryModalOpen}
          onClose={() => setCategoryModalOpen(false)}
        />
      )}

      {/* Stock History Audit Modal */}
      {historyProduct && (
        <StockHistoryModal
          isOpen={Boolean(historyProduct)}
          onClose={() => setHistoryProduct(null)}
          product={historyProduct}
        />
      )}

      {/* Barcode Label Printing Modal */}
      {barcodePrintOpen && (
        <BarcodePrintModal
          isOpen={barcodePrintOpen}
          onClose={() => setBarcodePrintOpen(false)}
          products={selectedProductsForPrint}
        />
      )}

      {/* CSV Bulk Import Modal */}
      {csvImportOpen && (
        <CsvImportModal
          isOpen={csvImportOpen}
          onClose={() => setCsvImportOpen(false)}
          categories={categories}
        />
      )}
    </div>
  );
};

export default ProductsPage;
