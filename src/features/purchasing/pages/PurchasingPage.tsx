import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ClipboardList,
  Plus,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Trash2,
  Search,
  Building,
  RotateCcw,
  RefreshCw,
  Eye,
  AlertCircle,
  Package,
  Barcode,
  Receipt,
  PackagePlus,
  Building2,
  Layers,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatCard } from '../../../components/ui/StatCard';
import { Button } from '../../../components/ui/Button';
import { Money } from '../../../components/ui/Money';
import { DataTable, Column } from '../../../components/ui/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { formatLKR } from '../../../lib/money';
import { useAuth } from '../../auth/hooks/useAuth';
import { PaymentMethod, PurchaseStatus } from '../../../types/database';
import { fetchSuppliers, Supplier } from '../../suppliers/api/suppliers';
import { fetchProducts } from '../../products/api/products';
import { ProductWithCategory } from '../../products/types';
import {
  receivePurchase,
  fetchPurchases,
  fetchPurchaseDetail,
  cancelPurchase,
  PurchaseListItem,
  PurchaseDetail,
} from '../api/purchasing';

interface GRNLineDraft {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  trackExpiry: boolean;
  currentCostCents: number;
  quantity: number;
  unitCostCents: number;
  batchNo: string;
  expiryDate: string;
}

export const PurchasingPage: React.FC = () => {
  const { role } = useAuth();
  const isOwner = role === 'owner';

  // Purchases list state
  const [purchases, setPurchases] = useState<PurchaseListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Filter state
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterStatus, setFilterStatus] = useState<PurchaseStatus | ''>('');

  // Goods-received modal / form state
  const [isGRNModalOpen, setIsGRNModalOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [grnLines, setGrnLines] = useState<GRNLineDraft[]>([]);
  const [paidNowRupees, setPaidNowRupees] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('bank_transfer');
  const [grnError, setGrnError] = useState<string | null>(null);
  const [isSubmittingGRN, setIsSubmittingGRN] = useState(false);

  // Product search inside GRN modal
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<ProductWithCategory[]>([]);
  const [isSearchingProduct, setIsSearchingProduct] = useState(false);

  // Detail / GRN Print modal state
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);
  const [purchaseDetail, setPurchaseDetail] = useState<PurchaseDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Cancel modal state
  const [purchaseToCancel, setPurchaseToCancel] = useState<PurchaseListItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Load suppliers and purchases
  const loadPurchases = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchPurchases({
        supplierId: filterSupplier || undefined,
        status: (filterStatus as PurchaseStatus) || undefined,
      });
      setPurchases(res.purchases);
      setTotalCount(res.count);
    } catch (err) {
      console.error('Failed to load purchases:', err);
    } finally {
      setIsLoading(false);
    }
  }, [filterSupplier, filterStatus]);

  useEffect(() => {
    loadPurchases();
  }, [loadPurchases]);

  useEffect(() => {
    fetchSuppliers()
      .then(setSuppliers)
      .catch((err) => console.error('Failed to load suppliers:', err));
  }, []);

  // Search products inside GRN form
  useEffect(() => {
    if (!productSearch.trim()) {
      setProductResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingProduct(true);
      try {
        const { products } = await fetchProducts(
          { search: productSearch.trim() },
          { page: 1, pageSize: 8 }
        );
        setProductResults(products);
      } catch (err) {
        console.error('Product search error:', err);
      } finally {
        setIsSearchingProduct(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [productSearch]);

  // Load purchase detail for GRN inspection / print
  useEffect(() => {
    if (!selectedPurchaseId) {
      setPurchaseDetail(null);
      return;
    }

    let isMounted = true;
    setIsDetailLoading(true);

    fetchPurchaseDetail(selectedPurchaseId)
      .then((detail) => {
        if (isMounted) setPurchaseDetail(detail);
      })
      .catch((err) => {
        console.error('Failed to load purchase detail:', err);
      })
      .finally(() => {
        if (isMounted) setIsDetailLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedPurchaseId]);

  const handleOpenGRNModal = () => {
    setSelectedSupplierId(suppliers.length > 0 && suppliers[0] ? suppliers[0].id : '');
    setInvoiceNo('');
    setGrnLines([]);
    setPaidNowRupees('');
    setPayMethod('bank_transfer');
    setGrnError(null);
    setProductSearch('');
    setProductResults([]);
    setIsGRNModalOpen(true);
  };

  const handleAddProductToGRN = (product: ProductWithCategory) => {
    // If line already exists, increment qty
    const existingIdx = grnLines.findIndex((l) => l.productId === product.id);
    if (existingIdx >= 0 && grnLines[existingIdx]) {
      const updated = [...grnLines];
      const existing = grnLines[existingIdx]!;
      updated[existingIdx] = {
        ...existing,
        quantity: existing.quantity + 1,
      };
      setGrnLines(updated);
    } else {
      const newLine: GRNLineDraft = {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        unit: product.unit,
        trackExpiry: Boolean(product.track_expiry),
        currentCostCents: Number(product.cost_price_cents || 0),
        quantity: 1,
        unitCostCents: Number(product.cost_price_cents || 0),
        batchNo: '',
        expiryDate: '',
      };
      setGrnLines([...grnLines, newLine]);
    }
    setProductSearch('');
    setProductResults([]);
  };

  const handleRemoveGRNLine = (index: number) => {
    setGrnLines(grnLines.filter((_, i) => i !== index));
  };

  const handleUpdateGRNLine = (index: number, updates: Partial<GRNLineDraft>) => {
    const updated = [...grnLines];
    if (updated[index]) {
      updated[index] = { ...updated[index]!, ...updates };
      setGrnLines(updated);
    }
  };

  // Calculations for GRN
  const totalOrderCents = grnLines.reduce((sum, line) => {
    return sum + BigInt(Math.round(line.quantity * line.unitCostCents));
  }, 0n);

  const paidNowCents = Math.round((parseFloat(paidNowRupees) || 0) * 100);
  const balanceOwedCents = totalOrderCents - BigInt(paidNowCents);

  const handleSubmitGRN = async (e: React.FormEvent) => {
    e.preventDefault();
    setGrnError(null);

    if (!selectedSupplierId) {
      setGrnError('Please select a supplier.');
      return;
    }
    if (!invoiceNo.trim()) {
      setGrnError('Please enter the supplier invoice number.');
      return;
    }
    if (grnLines.length === 0) {
      setGrnError('Please add at least one product item to receive.');
      return;
    }

    // Validate quantities, costs and expiry
    for (let i = 0; i < grnLines.length; i++) {
      const line = grnLines[i]!;
      if (line.quantity <= 0) {
        setGrnError(`Quantity for "${line.name}" must be greater than zero.`);
        return;
      }
      if (line.unitCostCents < 0) {
        setGrnError(`Unit cost for "${line.name}" cannot be negative.`);
        return;
      }
      if (line.trackExpiry && !line.expiryDate) {
        setGrnError(`Expiry date is required for batch-tracked product "${line.name}".`);
        return;
      }
    }

    if (paidNowCents < 0) {
      setGrnError('Paid amount cannot be negative.');
      return;
    }

    if (BigInt(paidNowCents) > totalOrderCents) {
      setGrnError('Paid amount cannot exceed total purchase order cost.');
      return;
    }

    setIsSubmittingGRN(true);

    try {
      await receivePurchase({
        supplierId: selectedSupplierId,
        invoiceNo: invoiceNo.trim(),
        items: grnLines.map((l) => ({
          product_id: l.productId,
          quantity: l.quantity,
          unit_cost_cents: l.unitCostCents,
          batch_no: l.batchNo.trim() || null,
          expiry_date: l.expiryDate || null,
        })),
        paidCents: paidNowCents,
        payMethod,
      });

      setIsGRNModalOpen(false);
      loadPurchases();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('DUPLICATE_INVOICE')) {
        setGrnError(
          `Invoice #${invoiceNo} has already been received from this supplier. Please verify the invoice number.`
        );
      } else {
        setGrnError(msg);
      }
    } finally {
      setIsSubmittingGRN(false);
    }
  };

  const handleOpenCancelModal = (p: PurchaseListItem) => {
    setPurchaseToCancel(p);
    setCancelReason('');
    setCancelError(null);
  };

  const handleConfirmCancel = async () => {
    if (!purchaseToCancel) return;
    setIsCancelling(true);
    setCancelError(null);

    try {
      await cancelPurchase(purchaseToCancel.id, cancelReason);
      setPurchaseToCancel(null);
      loadPurchases();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('STOCK_ALREADY_SOLD')) {
        setCancelError(
          'Cannot cancel this purchase order: Some or all products received have already been sold to customers, and stock would fall below zero.'
        );
      } else {
        setCancelError(msg);
      }
    } finally {
      setIsCancelling(false);
    }
  };

  const totalPurchasesVolumeCents = purchases
    .filter((p) => p.status === 'received')
    .reduce((sum, p) => sum + BigInt(p.total_cents), 0n);

  const columns: Column<PurchaseListItem>[] = [
    {
      id: 'invoice_no',
      header: 'Invoice No.',
      sortable: true,
      accessor: (row) => (
        <span className="font-mono font-bold text-slate-800">{row.invoice_no}</span>
      ),
    },
    {
      id: 'supplier_name',
      header: 'Supplier',
      sortable: true,
      accessor: (row) => <span className="font-semibold text-slate-900">{row.supplier_name}</span>,
    },
    {
      id: 'total_cents',
      header: 'Total Cost',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.total_cents,
      accessor: (row) => (
        <div className="text-right">
          <Money cents={row.total_cents} size="sm" className="font-bold text-slate-900 dark:text-white" />
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessor: (row) => (
        <Badge
          variant={
            row.status === 'received'
              ? 'success'
              : row.status === 'draft'
              ? 'info'
              : 'danger'
          }
          size="sm"
        >
          {row.status}
        </Badge>
      ),
    },
    {
      id: 'created_at',
      header: 'Date Received',
      sortable: true,
      accessor: (row) => (
        <span className="text-xs text-slate-500">
          {new Date(row.created_at).toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      accessor: (row) => (
        <div className="flex items-center justify-end space-x-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedPurchaseId(row.id)}
            title="View Goods Received Note (GRN)"
            className="p-1 text-slate-600 hover:text-slate-900"
          >
            <Eye className="w-4 h-4" />
          </Button>
          {isOwner && row.status === 'received' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleOpenCancelModal(row)}
              title="Cancel purchase and reverse stock (Owner only)"
              className="p-1 text-rose-600 hover:text-rose-800"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchasing & Goods Receiving (GRN)"
        subtitle="Manage supplier purchase invoices, batch tracking and stock receiving"
        actions={
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
              onClick={loadPurchases}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={handleOpenGRNModal}
            >
              Receive Goods (GRN)
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Received Purchases"
          value={<span className="tabular-nums font-mono">{purchases.filter((p) => p.status === 'received').length}</span>}
          variant="brand"
          icon={<ClipboardList className="w-5 h-5" />}
          subtitle="Processed vendor shipments"
        />
        <StatCard
          title="Purchasing Volume"
          value={<Money cents={totalPurchasesVolumeCents} size="md" />}
          variant="emerald"
          icon={<FileText className="w-5 h-5" />}
          subtitle="Total stock acquisition value"
        />
        <StatCard
          title="Active Suppliers"
          value={<span className="tabular-nums font-mono">{suppliers.length}</span>}
          variant="amber"
          icon={<Building className="w-5 h-5" />}
          subtitle="Wholesale trade partners"
        />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="w-64">
          <select
            value={filterSupplier}
            onChange={(e) => setFilterSupplier(e.target.value)}
            className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">All Suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="w-44">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as PurchaseStatus | '')}
            className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">All Statuses</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
            <option value="draft">Draft</option>
          </select>
        </div>
      </div>

      <DataTable<PurchaseListItem>
        data={purchases}
        columns={columns}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
        emptyTitle="No Purchases Found"
        emptyDescription="Receive items from your suppliers to build stock and maintain accurate costs."
      />

      {/* Receive Goods (GRN) Modal */}
      <Modal
        isOpen={isGRNModalOpen}
        onClose={() => setIsGRNModalOpen(false)}
        title="Receive Goods - New Purchase Order (GRN)"
        description="Log supplier shipments, verify unit costs, record batch numbers & expiry, and update stock balances."
        size="xl"
      >
        <form onSubmit={handleSubmitGRN} className="space-y-4">
          {grnError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 rounded-xl text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0" />
              <span className="font-semibold">{grnError}</span>
            </div>
          )}

          {/* Supplier & Invoice No Header Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl shadow-subtle">
            <div>
              <Select
                label="Supplier / Vendor"
                required
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                options={[
                  { value: '', label: '-- Choose Supplier --' },
                  ...suppliers.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
            </div>

            <div>
              <Input
                label="Supplier Invoice Number *"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="e.g. INV-98214"
                required
              />
            </div>
          </div>

          {/* Product Search & Scanner Input */}
          <div className="relative">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
              <span className="flex items-center space-x-1.5">
                <Barcode className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                <span>Scan Barcode or Search Products to Add</span>
              </span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal lowercase">
                (search by name, sku, or barcode)
              </span>
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Type SKU, barcode, or product name..."
                className="w-full min-h-[42px] pl-10 pr-24 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-subtle shadow-subtle"
              />
              {isSearchingProduct && (
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400 animate-pulse">
                  Searching...
                </span>
              )}
            </div>

            {/* Product search suggestions dropdown */}
            {productResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 border border-slate-200 dark:border-slate-700/80 rounded-xl bg-white dark:bg-slate-900 shadow-overlay overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto z-20">
                {productResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleAddProductToGRN(p)}
                    className="w-full p-3 text-left hover:bg-brand-50/70 dark:hover:bg-brand-950/50 flex items-center justify-between transition-colors cursor-pointer group"
                  >
                    <div>
                      <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors block">
                        {p.name}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5 block">
                        SKU: {p.sku} {p.barcode && `• Barcode: ${p.barcode}`} • Unit: {p.unit}
                      </span>
                    </div>
                    <div className="text-right flex items-center space-x-3">
                      <div>
                        <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 block">
                          Cost: {formatLKR(p.cost_price_cents || 0)}
                        </span>
                        {p.track_expiry && (
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            Batch Tracked
                          </span>
                        )}
                      </div>
                      <span className="p-1 rounded-lg bg-brand-100 dark:bg-brand-900/60 text-brand-700 dark:text-brand-300 group-hover:bg-brand-600 group-hover:text-white transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Line Items Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center space-x-2">
                <Layers className="w-4 h-4 text-slate-500" />
                <span>Received Line Items</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-bold">
                  {grnLines.length}
                </span>
              </div>
              {grnLines.length > 0 && (
                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                  Total Items: {grnLines.reduce((sum, l) => sum + l.quantity, 0)} units
                </span>
              )}
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-subtle">
              {grnLines.length === 0 ? (
                <div className="py-10 flex flex-col items-center justify-center text-center p-6 bg-slate-50/50 dark:bg-slate-900/40">
                  <div className="w-12 h-12 rounded-2xl bg-brand-50 dark:bg-brand-950/60 border border-brand-200/60 dark:border-brand-800/60 flex items-center justify-center text-brand-600 dark:text-brand-400 mb-2 shadow-subtle">
                    <Package className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    No items added to this shipment yet
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm">
                    Scan a barcode or use the search box above to add products to this Goods Received Note.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 text-[10px] sticky top-0 z-10 backdrop-blur-sm">
                      <tr>
                        <th className="py-2.5 px-3 min-w-[170px]">Product</th>
                        <th className="py-2.5 px-3 w-24">Qty</th>
                        <th className="py-2.5 px-3 w-28">Unit Cost (Rs)</th>
                        <th className="py-2.5 px-3 w-28">Batch No</th>
                        <th className="py-2.5 px-3 w-32">Expiry Date</th>
                        <th className="py-2.5 px-3 text-right min-w-[110px]">Line Total</th>
                        <th className="py-2.5 px-2 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {grnLines.map((line, idx) => {
                        const oldCost = line.currentCostCents;
                        const newCost = line.unitCostCents;
                        let variancePercent: number | null = null;
                        if (oldCost > 0) {
                          variancePercent = ((newCost - oldCost) / oldCost) * 100;
                        }
                        const isSignificantChange =
                          variancePercent !== null && Math.abs(variancePercent) > 20;

                        return (
                          <tr
                            key={line.productId}
                            className={`transition-colors ${
                              isSignificantChange
                                ? 'bg-amber-50/40 dark:bg-amber-950/20 hover:bg-amber-50/70 dark:hover:bg-amber-950/30'
                                : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            {/* Product Details */}
                            <td className="py-2.5 px-3">
                              <span className="font-bold text-slate-900 dark:text-slate-100 block">
                                {line.name}
                              </span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                                {line.sku} &bull; {line.unit}
                              </span>
                              {isSignificantChange && variancePercent !== null && (
                                <div className="mt-1 inline-flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                  <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                                  <span>
                                    Cost {variancePercent > 0 ? '+' : ''}
                                    {variancePercent.toFixed(1)}% vs old ({formatLKR(oldCost)})
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* Quantity */}
                            <td className="py-2.5 px-3">
                              <input
                                type="number"
                                min="0.001"
                                step="any"
                                value={line.quantity}
                                onChange={(e) =>
                                  handleUpdateGRNLine(idx, {
                                    quantity: parseFloat(e.target.value) || 0,
                                  })
                                }
                                className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg font-mono text-xs text-right bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                required
                              />
                            </td>

                            {/* Unit Cost */}
                            <td className="py-2.5 px-3">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={(line.unitCostCents / 100).toFixed(2)}
                                onChange={(e) =>
                                  handleUpdateGRNLine(idx, {
                                    unitCostCents: Math.round((parseFloat(e.target.value) || 0) * 100),
                                  })
                                }
                                className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg font-mono text-xs text-right bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                required
                              />
                            </td>

                            {/* Batch No */}
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                value={line.batchNo}
                                onChange={(e) => handleUpdateGRNLine(idx, { batchNo: e.target.value })}
                                placeholder={line.trackExpiry ? 'Batch (Req.)' : 'Optional'}
                                className={`w-full px-2 py-1.5 border rounded-lg font-mono text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-brand-500 ${
                                  line.trackExpiry && !line.batchNo
                                    ? 'border-purple-300 dark:border-purple-800'
                                    : 'border-slate-300 dark:border-slate-700'
                                }`}
                              />
                            </td>

                            {/* Expiry Date */}
                            <td className="py-2.5 px-3">
                              <input
                                type="date"
                                value={line.expiryDate}
                                onChange={(e) =>
                                  handleUpdateGRNLine(idx, { expiryDate: e.target.value })
                                }
                                className={`w-full px-2 py-1.5 border rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-brand-500 ${
                                  line.trackExpiry && !line.expiryDate
                                    ? 'border-purple-400 dark:border-purple-600 bg-purple-50/50 dark:bg-purple-950/30'
                                    : 'border-slate-300 dark:border-slate-700'
                                }`}
                                required={line.trackExpiry}
                              />
                            </td>

                            {/* Line Total */}
                            <td className="py-2.5 px-3 text-right">
                              <Money
                                size="sm"
                                cents={BigInt(Math.round(line.quantity * line.unitCostCents))}
                              />
                            </td>

                            {/* Remove action */}
                            <td className="py-2.5 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveGRNLine(idx)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors cursor-pointer"
                                title="Remove item"
                              >
                                <Trash2 className="w-4 h-4" />
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
          </div>

          {/* Payment & Totals Summary Panel */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 shadow-subtle">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 items-center">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Amount Paid Now (Rs.)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                    Rs.
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={paidNowRupees}
                    onChange={(e) => setPaidNowRupees(e.target.value)}
                    placeholder="0.00 (Unpaid on Credit)"
                    className="w-full min-h-[42px] pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-brand-500 shadow-subtle"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  Leave at 0 if inventory was purchased on vendor credit terms.
                </p>
              </div>

              <div>
                <Select
                  label="Payment Method"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                  options={[
                    { value: 'bank_transfer', label: 'Bank Transfer' },
                    { value: 'cash', label: 'Cash' },
                    { value: 'card', label: 'Company Card' },
                  ]}
                />
              </div>

              <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-right flex flex-col justify-center space-y-1.5 shadow-subtle">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium">Order Total:</span>
                  <Money size="md" cents={totalOrderCents} />
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <span className="text-slate-600 dark:text-slate-400 font-medium">Balance:</span>
                  {balanceOwedCents > 0n ? (
                    <span className="font-bold text-rose-600 dark:text-rose-400">
                      Owed: {formatLKR(balanceOwedCents)}
                    </span>
                  ) : balanceOwedCents === 0n && totalOrderCents > 0n ? (
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      Paid in Full
                    </span>
                  ) : balanceOwedCents < 0n ? (
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      Credit: {formatLKR(-balanceOwedCents)}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Modal Action Buttons */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
              {grnLines.length > 0 && (
                <span>
                  Receiving <strong className="text-slate-900 dark:text-slate-100">{grnLines.length}</strong> items into store inventory
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setIsGRNModalOpen(false)}
                disabled={isSubmittingGRN}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                type="submit"
                isLoading={isSubmittingGRN}
                disabled={grnLines.length === 0}
                leftIcon={<CheckCircle2 className="w-4 h-4" />}
              >
                Receive Inventory & Update Stock
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Goods Received Note (GRN) View & Print Modal */}
      <Modal
        isOpen={Boolean(selectedPurchaseId)}
        onClose={() => setSelectedPurchaseId(null)}
        title={`Goods Received Note (GRN) - ${purchaseDetail?.invoice_no || ''}`}
        size="lg"
      >
        {isDetailLoading ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-xs">
            Loading GRN information...
          </div>
        ) : purchaseDetail ? (
          <div className="space-y-4">
            <div className="flex justify-between items-start border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <span className="text-base font-bold text-slate-900 dark:text-slate-100 block">
                  Invoice #{purchaseDetail.invoice_no}
                </span>
                <span className="text-xs text-slate-600 dark:text-slate-400 block mt-0.5">
                  Supplier: <strong className="text-slate-800 dark:text-slate-200">{purchaseDetail.supplier.name}</strong>
                  {purchaseDetail.supplier.contact_person && (
                    <span> (Attn: {purchaseDetail.supplier.contact_person})</span>
                  )}
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono block mt-0.5">
                  Date: {new Date(purchaseDetail.created_at).toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })}
                </span>
              </div>
              <div className="text-right">
                <Badge
                  variant={purchaseDetail.status === 'received' ? 'success' : 'danger'}
                  size="md"
                >
                  {purchaseDetail.status}
                </Badge>
                <div className="mt-1">
                  <Money size="md" cents={purchaseDetail.total_cents} />
                </div>
              </div>
            </div>

            {/* Items Table */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto bg-white dark:bg-slate-900 shadow-subtle">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Item / SKU</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit Cost</th>
                    <th className="py-2.5 px-3">Batch & Expiry</th>
                    <th className="py-2.5 px-3 text-right">Total Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono text-[11px]">
                  {purchaseDetail.items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                      <td className="py-2.5 px-3 font-sans">
                        <span className="font-bold text-slate-900 dark:text-slate-100 block">
                          {item.product_name}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                          {item.product_sku}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-800 dark:text-slate-200">
                        {item.quantity} {item.product_unit}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-800 dark:text-slate-200">
                        {formatLKR(item.unit_cost_cents)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 font-sans text-xs">
                        {item.batch_no && <span>Batch: {item.batch_no} </span>}
                        {item.expiry_date && (
                          <span className="text-amber-700 dark:text-amber-400">Exp: {item.expiry_date}</span>
                        )}
                        {!item.batch_no && !item.expiry_date && <span>-</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Money size="sm" cents={item.total_cost_cents} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-800 print:hidden">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Printer className="w-3.5 h-3.5" />}
                onClick={() => window.print()}
              >
                Print GRN
              </Button>
              <Button variant="primary" size="sm" onClick={() => setSelectedPurchaseId(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Cancel Purchase Confirmation Modal (Owner Only) */}
      <Modal
        isOpen={Boolean(purchaseToCancel)}
        onClose={() => setPurchaseToCancel(null)}
        title="Cancel Purchase Order"
        size="md"
      >
        <div className="space-y-4">
          {cancelError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center space-x-1.5">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{cancelError}</span>
            </div>
          )}

          <p className="text-xs text-slate-600 leading-relaxed">
            Are you sure you want to cancel purchase invoice{' '}
            <strong className="text-slate-900">#{purchaseToCancel?.invoice_no}</strong>?
            This will reverse the inventory stock quantities and adjust the supplier's balance.
          </p>

          <Input
            label="Cancellation Reason *"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="e.g. Invoiced in error / Shipment returned to vendor"
            required
          />

          <div className="flex justify-end space-x-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPurchaseToCancel(null)}
              disabled={isCancelling}
            >
              Back
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleConfirmCancel}
              isLoading={isCancelling}
            >
              Confirm Cancellation
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PurchasingPage;
