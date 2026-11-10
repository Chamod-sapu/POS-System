import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, ArrowUpRight, ArrowDownRight, User, ShieldCheck } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Badge } from '../../../components/ui/Badge';
import { Spinner } from '../../../components/ui/Spinner';
import { fetchStockHistory } from '../api/products';
import { StockMovementWithStaff } from '../types';

export interface StockHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: {
    id: string;
    name: string;
    sku: string;
    stock_qty: number;
    unit: string;
  } | null;
}

export const StockHistoryModal: React.FC<StockHistoryModalProps> = ({
  isOpen,
  onClose,
  product,
}) => {
  const { data: history = [], isLoading } = useQuery<StockMovementWithStaff[]>({
    queryKey: ['stock-history', product?.id],
    queryFn: () => (product?.id ? fetchStockHistory(product.id) : Promise.resolve([])),
    enabled: isOpen && Boolean(product?.id),
  });

  const getMovementBadge = (type: string) => {
    switch (type) {
      case 'opening':
        return <Badge variant="purple" size="sm">Opening Stock</Badge>;
      case 'purchase':
        return <Badge variant="info" size="sm">Purchase / GRN</Badge>;
      case 'sale':
        return <Badge variant="neutral" size="sm">POS Sale</Badge>;
      case 'sale_void':
        return <Badge variant="warning" size="sm">Sale Void</Badge>;
      case 'return':
        return <Badge variant="success" size="sm">Customer Return</Badge>;
      case 'adjustment':
        return <Badge variant="warning" size="sm">Adjustment</Badge>;
      case 'damage':
        return <Badge variant="danger" size="sm">Damage / Loss</Badge>;
      case 'stocktake':
        return <Badge variant="info" size="sm">Stocktake Correction</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{type}</Badge>;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center space-x-2">
          <History className="w-5 h-5 text-emerald-600" />
          <span>Stock Audit Ledger: {product?.name}</span>
        </div>
      }
      description={`SKU: ${product?.sku} • Current Stock: ${product?.stock_qty} ${product?.unit}`}
      size="xl"
    >
      <div className="space-y-4">
        {/* Immutability Banner */}
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="font-semibold">
              Tamper-evident append-only ledger protected by database immutability triggers.
            </span>
          </div>
          <span className="text-[11px] font-mono text-emerald-700">READ-ONLY</span>
        </div>

        {/* History Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider font-bold">
                <tr>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 text-right">Qty Change</th>
                  <th className="py-3 px-4 text-right">Balance After</th>
                  <th className="py-3 px-4">Reason / Notes</th>
                  <th className="py-3 px-4">Recorded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      <Spinner size="md" />
                      <p className="mt-2 text-xs">Loading ledger history...</p>
                    </td>
                  </tr>
                ) : history.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      No stock movements recorded for this item yet.
                    </td>
                  </tr>
                ) : (
                  history.map((row) => {
                    const isPositive = Number(row.qty_change) > 0;
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-500">
                          {new Date(row.created_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">{getMovementBadge(row.movement_type)}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold">
                          <span
                            className={`inline-flex items-center ${
                              isPositive ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {isPositive ? (
                              <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                            ) : (
                              <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
                            )}
                            {isPositive ? '+' : ''}
                            {row.qty_change} {product?.unit}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          {row.qty_after} {product?.unit}
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                          {row.reason || row.reference_type || 'Standard movement'}
                        </td>
                        <td className="py-3 px-4 text-slate-500 flex items-center space-x-1">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{row.staff_name}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
};

