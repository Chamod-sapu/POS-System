import React from 'react';
import { Printer, X } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { ReturnDetailSnapshot } from '../api/returns';
import { ReturnReceipt } from '../../receipts/components/ReturnReceipt';

export interface ReturnReceiptModalProps {
  isOpen: boolean;
  returnSnapshot: ReturnDetailSnapshot | null;
  onClose: () => void;
}

export const ReturnReceiptModal: React.FC<ReturnReceiptModalProps> = ({
  isOpen,
  returnSnapshot,
  onClose,
}) => {
  if (!isOpen || !returnSnapshot) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-6">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Return Credit Note: {returnSnapshot.return_number}
            </h3>
            <p className="text-[11px] text-slate-500">
              Thermal receipt copy for customer & register records
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 bg-slate-50 flex justify-center">
          <ReturnReceipt returnSnapshot={returnSnapshot} paperWidth="80mm" />
        </div>

        <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-end space-x-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handlePrint}
            leftIcon={<Printer className="w-4 h-4" />}
          >
            Print Credit Note
          </Button>
        </div>
      </div>
    </div>
  );
};

