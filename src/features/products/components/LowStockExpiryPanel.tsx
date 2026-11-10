import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, Download, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Spinner } from '../../../components/ui/Spinner';
import { fetchLowStockAndExpiring } from '../api/products';
import { formatLKR } from '../../../lib/money';

export const LowStockExpiryPanel: React.FC = () => {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['low-stock-expiring'],
    queryFn: fetchLowStockAndExpiring,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

  const lowStockItems = data?.lowStockItems || [];
  const expiringBatches = data?.expiringBatches || [];

  const handleExportCsv = () => {
    if (lowStockItems.length === 0 && expiringBatches.length === 0) return;

    let csvContent = 'Type,SKU,Product Name,Stock / Batch Qty,Reorder / Expiry Info\n';

    lowStockItems.forEach((item) => {
      csvContent += `Low Stock,${item.sku},"${item.name}",${item.stock_qty} ${item.unit},Reorder Level: ${item.reorder_level} ${item.unit}\n`;
    });

    expiringBatches.forEach((batch) => {
      csvContent += `Expiring Batch,${batch.sku},"${batch.product_name}",${batch.qty_remaining} units,Batch: ${batch.batch_no} Exp: ${batch.expiry_date} (${batch.days_until_expiry} days)\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `wewala_low_stock_expiry_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCreatePurchase = () => {
    // Navigate to purchasing with low stock alert context
    navigate('/purchasing');
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        <Spinner size="md" />
        <p className="mt-2">Scanning stock levels and batch expiry dates...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
        <div>
          <h3 className="text-base font-bold text-slate-900">Inventory Health Alerts</h3>
          <p className="text-xs text-slate-500">
            {lowStockItems.length} products below reorder threshold • {expiringBatches.length} batches expiring within 30 days
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download className="w-4 h-4" />}
            onClick={handleExportCsv}
            disabled={lowStockItems.length === 0 && expiringBatches.length === 0}
          >
            Export CSV
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<ShoppingBag className="w-4 h-4" />}
            onClick={handleCreatePurchase}
          >
            Create Purchase Order
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Table 1: Low Stock Items */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
          <div className="p-4 bg-amber-50/60 border-b border-amber-200/60 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <h4 className="text-sm font-bold text-slate-900">Low Stock Reorder Alerts</h4>
            </div>
            <span className="text-xs font-mono font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
              {lowStockItems.length}
            </span>
          </div>

          <div className="overflow-x-auto flex-1 max-h-80 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3">Product</th>
                  <th className="py-2.5 px-3 text-right">In Stock</th>
                  <th className="py-2.5 px-3 text-right">Reorder</th>
                  <th className="py-2.5 px-3 text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {lowStockItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      All products are currently above their reorder thresholds.
                    </td>
                  </tr>
                ) : (
                  lowStockItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{item.sku}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900 truncate max-w-xs">
                        {item.name}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700">
                        {item.stock_qty} {item.unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                        {item.reorder_level} {item.unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800">
                        {formatLKR(item.selling_price_cents)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 2: Expiring Batches */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
          <div className="p-4 bg-rose-50/60 border-b border-rose-200/60 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-rose-600" />
              <h4 className="text-sm font-bold text-slate-900">Expiring Within 30 Days (FEFO)</h4>
            </div>
            <span className="text-xs font-mono font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full">
              {expiringBatches.length}
            </span>
          </div>

          <div className="overflow-x-auto flex-1 max-h-80 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">Batch #</th>
                  <th className="py-2.5 px-3">Product</th>
                  <th className="py-2.5 px-3 text-right">Remaining</th>
                  <th className="py-2.5 px-3">Expiry Date</th>
                  <th className="py-2.5 px-3 text-right">Time Left</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {expiringBatches.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No tracked batches are expiring within the next 30 days.
                    </td>
                  </tr>
                ) : (
                  expiringBatches.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{b.batch_no}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900 truncate max-w-xs">
                        {b.product_name}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {b.qty_remaining}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{b.expiry_date}</td>
                      <td className="py-2.5 px-3 text-right">
                        <Badge
                          variant={b.days_until_expiry <= 7 ? 'danger' : 'warning'}
                          size="sm"
                        >
                          {b.days_until_expiry <= 0
                            ? 'EXPIRED'
                            : `${b.days_until_expiry} day${b.days_until_expiry === 1 ? '' : 's'}`}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

