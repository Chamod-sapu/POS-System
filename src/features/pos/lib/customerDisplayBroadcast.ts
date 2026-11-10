export interface CustomerDisplayItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  lineTotalCents: number;
}

export type CustomerDisplayMessage =
  | {
      type: 'CART_UPDATE';
      items: CustomerDisplayItem[];
      subtotalCents: number;
      totalCents: number;
    }
  | {
      type: 'SALE_COMPLETED';
      billNo: string;
      totalCents: number;
      changeDueCents: number;
    }
  | {
      type: 'RESET';
    };

const CHANNEL_NAME = 'wewala-customer-display';

export function broadcastToCustomerDisplay(message: CustomerDisplayMessage) {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(message);
      channel.close();
    } catch {
      // Ignore broadcast errors
    }
  }
}

