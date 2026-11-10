import React from 'react';
import { Keyboard } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';

export interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { key: 'F2', label: 'Focus Barcode / Product Search input' },
  { key: 'F4', label: 'Open Checkout / Payment Modal' },
  { key: 'F6', label: 'Focus Customer Phone Lookup input' },
  { key: 'F8', label: 'Park Current Cart (Hold)' },
  { key: 'F9', label: 'Recall Parked Carts' },
  { key: 'Esc', label: 'Close Active Modal / Dropdown' },
  { key: 'Ctrl + Backspace', label: 'Clear Cart (with confirmation dialog)' },
  { key: 'Enter', label: 'Add highlighted item / Confirm payment' },
  { key: '↑ / ↓', label: 'Navigate search product results' },
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="POS Keyboard Shortcuts" size="md">
      <div className="space-y-4">
        <div className="flex items-center space-x-2 text-xs text-slate-500 pb-2 border-b border-slate-100">
          <Keyboard className="w-4 h-4 text-emerald-600" />
          <span>The entire POS flow can be operated without touching the mouse:</span>
        </div>

        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
          {SHORTCUTS.map((s) => (
            <div key={s.key} className="py-2.5 px-4 flex items-center justify-between hover:bg-slate-50">
              <span className="text-slate-700">{s.label}</span>
              <kbd className="px-2 py-1 font-mono text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-300 rounded shadow-sm">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="primary" onClick={onClose}>
            Got It (Esc)
          </Button>
        </div>
      </div>
    </Modal>
  );
};

