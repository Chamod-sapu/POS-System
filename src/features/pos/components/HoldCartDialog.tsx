import React, { useState, useEffect, useRef } from 'react';
import { PauseCircle } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';

export interface HoldCartDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (label: string) => void;
  itemCount: number;
}

export const HoldCartDialog: React.FC<HoldCartDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  itemCount,
}) => {
  const [label, setLabel] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setLabel(`Customer #${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    onConfirm(label.trim() || 'Held Cart');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Hold Cart (F8)" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center space-x-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
          <PauseCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="text-xs">
            Parking <strong className="font-bold">{itemCount} items</strong>. Held carts do not reserve stock. You can restore this cart at any time by pressing <strong className="font-bold">F9</strong>.
          </div>
        </div>

        <div>
          <Input
            ref={inputRef}
            label="Cart Label / Reference (Optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Stepped out to car, phone order, etc."
          />
        </div>

        <div className="flex justify-end space-x-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel (Esc)
          </Button>
          <Button variant="primary" type="submit">
            Park Cart (Enter)
          </Button>
        </div>
      </form>
    </Modal>
  );
};

