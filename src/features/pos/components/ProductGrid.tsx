import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutGrid,
  List,
  Scale,
  Search,
  ChevronLeft,
  ChevronRight,
  Package,
  PackageX,
  Plus,
  ArrowUpDown,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { POSProduct } from '../types';
import { fetchCategories } from '../../products/api/products';
import { Money } from '../../../components/ui/Money';
import { Badge } from '../../../components/ui/Badge';
import { Skeleton } from '../../../components/ui/Skeleton';
import { SegmentedControl } from '../../../components/ui/SegmentedControl';
import { Button } from '../../../components/ui/Button';

export interface ProductGridProps {
  products: POSProduct[];
  isLoading: boolean;
  onSelectProduct: (product: POSProduct) => void;
}

type ViewMode = 'grid' | 'list';
type StockFilter = 'all' | 'in_stock' | 'low_stock' | 'weighed';
type SortOption = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'stock_desc';
type PageSize = 24 | 48 | 96 | -1;

// Category border accents
const CATEGORY_ACCENT_COLORS = [
  'border-l-brand-500',
  'border-l-indigo-500',
  'border-l-sky-500',
  'border-l-amber-500',
  'border-l-emerald-500',
  'border-l-purple-500',
  'border-l-rose-500',
  'border-l-teal-500',
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
  // 1. Fetch categories to display human-readable names
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });

  // Map of category ID to name
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((cat) => {
      map.set(cat.id, cat.name);
    });
    return map;
  }, [categories]);

  // View state & preferences
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('wewala_pos_grid_view') as ViewMode) || 'grid';
  });

  // Save view mode preference
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('wewala_pos_grid_view', mode);
  };

  // Filters & sorting state
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [filterSearch, setFilterSearch] = useState<string>('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [sortOption, setSortOption] = useState<SortOption>('name_asc');

  // Pagination state
  const [pageSize, setPageSize] = useState<PageSize>(24);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Extract unique category IDs present in the catalog
  const catalogCategories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      if (p.category_id) cats.add(p.category_id);
    });
    return Array.from(cats);
  }, [products]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, filterSearch, stockFilter, sortOption, pageSize]);

  // Multi-tier filtering & sorting
  const filteredAndSortedProducts = useMemo(() => {
    let result = products;

    // 1. Category filter
    if (selectedCategory !== 'all') {
      result = result.filter((p) => p.category_id === selectedCategory);
    }

    // 2. In-grid text search
    if (filterSearch.trim()) {
      const q = filterSearch.trim().toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q))
      );
    }

    // 3. Stock filter
    if (stockFilter === 'in_stock') {
      result = result.filter((p) => Number(p.stock_qty) > 0);
    } else if (stockFilter === 'low_stock') {
      result = result.filter((p) => Number(p.stock_qty) > 0 && Number(p.stock_qty) <= 5);
    } else if (stockFilter === 'weighed') {
      result = result.filter((p) => p.allow_decimal_qty);
    }

    // 4. Sorting
    const sorted = [...result];
    sorted.sort((a, b) => {
      switch (sortOption) {
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        case 'price_asc':
          return a.selling_price_cents - b.selling_price_cents;
        case 'price_desc':
          return b.selling_price_cents - a.selling_price_cents;
        case 'stock_desc':
          return Number(b.stock_qty) - Number(a.stock_qty);
        default:
          return 0;
      }
    });

    return sorted;
  }, [products, selectedCategory, filterSearch, stockFilter, sortOption]);

  // Pagination calculation
  const totalItems = filteredAndSortedProducts.length;
  const totalPages = pageSize === -1 ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedProducts = useMemo(() => {
    if (pageSize === -1) return filteredAndSortedProducts;
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredAndSortedProducts.slice(start, start + pageSize);
  }, [filteredAndSortedProducts, safeCurrentPage, pageSize]);

  const startIndex = pageSize === -1 ? 0 : (safeCurrentPage - 1) * pageSize;
  const endIndex = pageSize === -1 ? totalItems : Math.min(startIndex + pageSize, totalItems);

  // Clear all active filters
  const handleResetFilters = () => {
    setSelectedCategory('all');
    setFilterSearch('');
    setStockFilter('all');
    setSortOption('name_asc');
  };

  const hasActiveFilters =
    selectedCategory !== 'all' ||
    filterSearch.trim() !== '' ||
    stockFilter !== 'all' ||
    sortOption !== 'name_asc';

  if (isLoading) {
    return (
      <div className="flex flex-col h-full space-y-3 p-1">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, idx) => (
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
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-slate-500">
        <Package className="w-12 h-12 mx-auto stroke-1 mb-2 text-slate-300 dark:text-slate-600" />
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          No active products in catalog
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
          Please add products in the Inventory module first.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden space-y-2.5">
      {/* =================================================================== */}
      {/* 1. CATEGORY PILLS BAR (Scrollable horizontally)                    */}
      {/* =================================================================== */}
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none select-none flex-shrink-0">
        <button
          type="button"
          onClick={() => setSelectedCategory('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-subtle whitespace-nowrap cursor-pointer flex items-center space-x-1.5 ${
            selectedCategory === 'all'
              ? 'bg-brand-600 text-white shadow-subtle ring-1 ring-brand-500'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <span>All Items</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              selectedCategory === 'all'
                ? 'bg-brand-700 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}
          >
            {products.length}
          </span>
        </button>

        {catalogCategories.map((catId) => {
          const catName = categoryMap.get(catId) || 'Other';
          const count = products.filter((p) => p.category_id === catId).length;
          const isSelected = selectedCategory === catId;

          return (
            <button
              key={catId}
              type="button"
              onClick={() => setSelectedCategory(catId)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-subtle whitespace-nowrap cursor-pointer flex items-center space-x-1.5 ${
                isSelected
                  ? 'bg-brand-600 text-white shadow-subtle ring-1 ring-brand-500'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span>{catName}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  isSelected
                    ? 'bg-brand-700 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* =================================================================== */}
      {/* 2. CATALOG CONTROLS TOOLBAR (Search, Filters, Sort, View Mode)      */}
      {/* =================================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800/80 rounded-xl flex-shrink-0">
        {/* Left: Quick In-Grid Filter & Stock Status Chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* In-Catalog Text Filter */}
          <div className="relative w-40 sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              placeholder="Filter items..."
              className="w-full pl-8 pr-2 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Stock Filter Chips */}
          <div className="flex items-center space-x-1 text-xs">
            <button
              type="button"
              onClick={() => setStockFilter('all')}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                stockFilter === 'all'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setStockFilter('in_stock')}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer flex items-center space-x-1 ${
                stockFilter === 'in_stock'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>In Stock</span>
            </button>
            <button
              type="button"
              onClick={() => setStockFilter('low_stock')}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer flex items-center space-x-1 ${
                stockFilter === 'low_stock'
                  ? 'bg-amber-600 text-white font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Low Stock</span>
            </button>
            <button
              type="button"
              onClick={() => setStockFilter('weighed')}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer flex items-center space-x-1 ${
                stockFilter === 'weighed'
                  ? 'bg-purple-600 text-white font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <Scale className="w-3 h-3" />
              <span>Weighed</span>
            </button>
          </div>
        </div>

        {/* Right: Sort & View Mode Switcher */}
        <div className="flex items-center gap-2">
          {/* Sort Selector */}
          <div className="flex items-center space-x-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-0.5 text-xs">
            <ArrowUpDown className="w-3 h-3 text-slate-400" />
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="bg-transparent text-xs text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer py-1"
            >
              <option value="name_asc">Name (A → Z)</option>
              <option value="name_desc">Name (Z → A)</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="stock_desc">Stock: High to Low</option>
            </select>
          </div>

          {/* View Mode Toggle (Grid / List) */}
          <SegmentedControl<ViewMode>
            size="sm"
            value={viewMode}
            onChange={handleViewModeChange}
            options={[
              { value: 'grid', label: 'Grid', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
              { value: 'list', label: 'List', icon: <List className="w-3.5 h-3.5" /> },
            ]}
          />
        </div>
      </div>

      {/* =================================================================== */}
      {/* 3. PRODUCT LISTING: GRID VIEW OR COMPACT LIST VIEW                   */}
      {/* =================================================================== */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {filteredAndSortedProducts.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center">
            <PackageX className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              No matching products found
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs">
              No catalog items match your selected filters or search terms.
            </p>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="mt-3 text-xs"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                Clear All Filters
              </Button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          /* =================================================================== */
          /* 3A. TOUCH TILE GRID VIEW                                            */
          /* =================================================================== */
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 p-1">
            {paginatedProducts.map((p) => {
              const stock = Number(p.stock_qty);
              const isOutOfStock = stock <= 0;
              const isLowStock = stock > 0 && stock <= 5;
              const categoryBorder = getCategoryColor(p.category_id);
              const categoryName = categoryMap.get(p.category_id || '') || null;

              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={isOutOfStock}
                  onClick={() => onSelectProduct(p)}
                  className={`p-3 rounded-xl border-t border-r border-b border-l-4 ${categoryBorder} text-left flex flex-col justify-between transition-subtle select-none relative cursor-pointer group shadow-subtle min-h-[120px] ${
                    isOutOfStock
                      ? 'bg-slate-100 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 opacity-40 grayscale cursor-not-allowed'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-brand-500 dark:hover:border-brand-400 hover:shadow-raised active:scale-[0.98]'
                  }`}
                >
                  {/* Decimal / Scale Indicator */}
                  {p.allow_decimal_qty && (
                    <div
                      title="Weighable / Decimal quantity (kg)"
                      className="absolute top-2 right-2 p-1 bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 rounded-md shadow-subtle"
                    >
                      <Scale className="w-3.5 h-3.5" />
                    </div>
                  )}

                  <div>
                    {/* Category tag */}
                    {categoryName && (
                      <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider truncate mb-1 pr-6">
                        {categoryName}
                      </div>
                    )}
                    <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 line-clamp-2 pr-4 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                      {p.name}
                    </div>
                    <div className="font-mono text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                      {p.sku} {p.barcode ? `• ${p.barcode}` : ''}
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-1">
                    <Money size="sm" cents={p.selling_price_cents} />
                    <Badge
                      className="stock-badge"
                      data-testid={`stock-badge-${p.sku}`}
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
        ) : (
          /* =================================================================== */
          /* 3B. COMPACT HIGH-DENSITY LIST VIEW (TABLE)                          */
          /* =================================================================== */
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-subtle">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold select-none">
                  <th className="py-2.5 px-3">Product</th>
                  <th className="py-2.5 px-3 hidden sm:table-cell">SKU / Barcode</th>
                  <th className="py-2.5 px-3 hidden md:table-cell">Category</th>
                  <th className="py-2.5 px-3 text-right">Stock</th>
                  <th className="py-2.5 px-3 text-right">Price</th>
                  <th className="py-2.5 px-3 text-center w-16">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {paginatedProducts.map((p) => {
                  const stock = Number(p.stock_qty);
                  const isOutOfStock = stock <= 0;
                  const isLowStock = stock > 0 && stock <= 5;
                  const categoryName = categoryMap.get(p.category_id || '') || '—';

                  return (
                    <tr
                      key={p.id}
                      onClick={() => !isOutOfStock && onSelectProduct(p)}
                      className={`transition-colors ${
                        isOutOfStock
                          ? 'opacity-40 grayscale bg-slate-50/50 dark:bg-slate-900/30 cursor-not-allowed select-none'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer'
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-1.5">
                          <span>{p.name}</span>
                          {p.allow_decimal_qty && (
                            <span
                              title="Weighable item"
                              className="inline-flex text-purple-600 dark:text-purple-400"
                            >
                              <Scale className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                        <div className="sm:hidden font-mono text-[10px] text-slate-400 mt-0.5">
                          {p.sku}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                        <div>{p.sku}</div>
                        {p.barcode && <div className="text-[10px] text-slate-400">{p.barcode}</div>}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 hidden md:table-cell">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-medium">
                          {categoryName}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Badge
                          className="stock-badge inline-flex"
                          data-testid={`stock-badge-${p.sku}`}
                          variant={isOutOfStock ? 'stock-out' : isLowStock ? 'stock-low' : 'stock-in'}
                          size="sm"
                          dot
                          pulseDot={isLowStock}
                        >
                          {isOutOfStock ? '0' : `${stock} ${p.unit}`}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium">
                        <Money size="sm" cents={p.selling_price_cents} />
                      </td>
                      <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          disabled={isOutOfStock}
                          onClick={() => onSelectProduct(p)}
                          className={`p-1.5 rounded-lg font-bold transition-subtle ${
                            isOutOfStock
                              ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                              : 'bg-brand-50 hover:bg-brand-600 text-brand-600 hover:text-white dark:bg-brand-950/60 dark:hover:bg-brand-600 dark:text-brand-300 dark:hover:text-white cursor-pointer active:scale-95'
                          }`}
                          title={isOutOfStock ? 'Out of stock' : 'Add to cart'}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* 4. SCALABLE PAGINATION BAR (For large catalog growth)               */}
      {/* =================================================================== */}
      {totalItems > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 px-1 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 select-none flex-shrink-0">
          {/* Summary */}
          <div className="font-mono text-[11px]">
            Showing <span className="font-bold text-slate-700 dark:text-slate-300">{startIndex + 1}</span>–
            <span className="font-bold text-slate-700 dark:text-slate-300">{endIndex}</span> of{' '}
            <span className="font-bold text-slate-700 dark:text-slate-300">{totalItems}</span> items
          </div>

          {/* Page controls */}
          <div className="flex items-center space-x-2">
            {/* Page Size Selector */}
            <div className="flex items-center space-x-1 text-[11px]">
              <span className="hidden sm:inline">Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
              >
                <option value={24}>24</option>
                <option value={48}>48</option>
                <option value={96}>96</option>
                <option value={-1}>All</option>
              </select>
            </div>

            {/* Prev / Next buttons */}
            {pageSize !== -1 && totalPages > 1 && (
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="px-2 font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  {safeCurrentPage} / {totalPages}
                </span>

                <button
                  type="button"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductGrid;
