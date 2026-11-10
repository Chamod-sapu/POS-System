import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlayCircle, Trash2, Clock, ShoppingCart } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Spinner } from '../../../components/ui/Spinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { fetchHeldCarts, deleteHeldCart } from '../api/pos';
import { HeldCartRow, CartItem } from '../types';
import { formatLKR } from '../../../lib/money';
import { maskPhoneNumber } from '../../receipts/lib/maskPhone';
import { useToast } from '../../../components/ui/Toast';
import { mapErrorMessage } from '../../../lib/errors';

export interface HeldCartsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestore: (heldCart: HeldCartRow) => void;
}

export const HeldCartsModal: React.FC<HeldCartsModalProps> = ({
  isOpen,
  onClose,
  onRestore,
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: heldCarts = [], isLoading } = useQuery({
    queryKey: ['held-carts'],
    queryFn: fetchHeldCarts,
    enabled: isOpen,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteHeldCart(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['held-carts'] });
      toast.success('Held cart deleted');
    },
    onError: (err: unknown) => {
      toast.error(mapErrorMessage(err));
    },
  });

  const handleRestore = (cart: HeldCartRow) => {
    onRestore(cart);
    deleteMutation.mutate(cart.id);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Recall Held Carts (F9)" size="lg">
      <div className="space-y-4">
        {isLoading ? (
          <div className="py-12 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : heldCarts.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart className="w-10 h-10 text-slate-400" />}
            title="No Parked Carts"
            description="You do not have any parked carts on hold. Press F8 while building a cart to park it."
          />
        ) : (
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden max-h-[500px] overflow-y-auto">
            {heldCarts.map((c) => {
              const items: CartItem[] = (c.cart_json?.items || []) as CartItem[];
              const totalItems = items.reduce((sum, i) => sum + Number(i.quantity), 0);
              const previewTotalCents = items.reduce(
                (sum, i) => sum + (i.localLineTotalCents || (i.unitPriceCents * i.quantity)),
                0
              );
              const formattedDate = new Date(c.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });

              return (
                <div
                  key={c.id}
                  className="p-4 hover:bg-slate-50 flex items-center justify-between gap-4 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-slate-900 truncate">
                        {c.label}
                      </span>
                      <span className="inline-flex items-center text-[11px] text-slate-400 font-mono">
                        <Clock className="w-3 h-3 mr-1" />
                        {formattedDate}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 mt-0.5">
                      {totalItems} items: {items.map((i) => i.name).slice(0, 3).join(', ')}
                      {items.length > 3 && ` +${items.length - 3} more`}
                    </div>

                    {c.cart_json?.customerPhone && (
                      <div className="text-[11px] text-emerald-700 font-mono mt-0.5">
                        Customer: {c.cart_json.customerName ? `${c.cart_json.customerName} • ` : ''}
                        {maskPhoneNumber(c.cart_json.customerPhone)}
                      </div>
                    )}
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div className="font-mono font-bold text-sm text-slate-900">
                      {formatLKR(previewTotalCents)}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 flex-shrink-0">
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<PlayCircle className="w-4 h-4" />}
                      onClick={() => handleRestore(c)}
                    >
                      Resume
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                      onClick={() => deleteMutation.mutate(c.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>
            Close (Esc)
          </Button>
        </div>
      </div>
    </Modal>
  );
};

