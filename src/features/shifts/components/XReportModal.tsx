import React, { useState, useEffect } from 'react';
import { RefreshCw, Printer, X, BarChart3 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { fetchXReport, XReportData, Shift } from '../api/shifts';
import { ShiftReportReceipt } from '../../receipts/components/ShiftReportReceipt';

export interface XReportModalProps {
  isOpen: boolean;
  shift: Shift | null;
  onClose: () => void;
}

export const XReportModal: React.FC<XReportModalProps> = ({
  isOpen,
  shift,
  onClose,
}) => {
  const [data, setData] = useState<XReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReport = () => {
    if (!shift) return;
    setIsLoading(true);
    setError(null);
    fetchXReport(shift.id)
      .then((res) => setData(res))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (isOpen && shift) {
      loadReport();
    }
  }, [isOpen, shift]);

  if (!isOpen || !shift) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-6">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Mid-Shift X-Report</h3>
              <p className="text-[11px] text-slate-500">
                Non-closing drawer snapshot & financial reconciliation
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={loadReport}
              disabled={isLoading}
              title="Refresh Figures"
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 bg-slate-50 flex flex-col items-center justify-center">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-slate-500 flex items-center space-x-2">
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
              <span>Calculating live drawer balance...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 text-rose-800 text-xs rounded-xl font-medium border border-rose-200">
              {error}
            </div>
          ) : data ? (
            <ShiftReportReceipt data={data} paperWidth="80mm" />
          ) : null}
        </div>

        <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Note: Printing an X-Report does not close the shift.
          </span>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handlePrint}
              disabled={!data}
              leftIcon={<Printer className="w-4 h-4" />}
            >
              Print X-Report
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

