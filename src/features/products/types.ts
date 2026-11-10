import { z } from 'zod';
import { Database } from '../../types/database';

export type Product = Database['public']['Tables']['products']['Row'];
export type Category = Database['public']['Tables']['categories']['Row'];
export type StockMovement = Database['public']['Tables']['stock_movements']['Row'];
export type StockBatch = Database['public']['Tables']['stock_batches']['Row'];

export interface ProductWithCategory extends Product {
  category?: Category | null;
}

export interface StockMovementWithStaff extends StockMovement {
  staff_name?: string | null;
}

export interface LowStockItem {
  id: string;
  sku: string;
  name: string;
  stock_qty: number;
  reorder_level: number;
  unit: string;
  cost_price_cents: bigint;
  selling_price_cents: bigint;
}

export interface ExpiringBatchItem {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  batch_no: string;
  qty_remaining: number;
  expiry_date: string;
  days_until_expiry: number;
}

// Zod schema for Product Form (React Hook Form)
export const productFormSchema = z.object({
  sku: z
    .string()
    .min(1, 'SKU is required')
    .max(50, 'SKU must be under 50 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'SKU can only contain letters, numbers, hyphens and underscores'),
  barcode: z
    .string()
    .trim()
    .max(100, 'Barcode must be under 100 characters')
    .optional()
    .or(z.literal('')),
  name: z.string().min(2, 'Product name is required (min 2 characters)'),
  category_id: z.string().uuid('Please select a valid category'),
  unit: z.enum(['pcs', 'kg', 'g', 'l', 'ml', 'pack', 'box']),
  allow_decimal_qty: z.boolean().default(false),
  cost_price_rupees: z.string().min(1, 'Cost price is required'),
  selling_price_rupees: z.string().min(1, 'Selling price is required'),
  tax_exempt: z.boolean().default(false),
  reorder_level: z.string().default('0'),
  track_expiry: z.boolean().default(false),
  opening_stock_qty: z.string().optional(),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

