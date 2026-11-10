/**
 * Wewala POS - Database TypeScript Type Definitions
 * 
 * Generated to match PostgreSQL migrations:
 * - 001_extensions_enums.sql
 * - 002_core_tables.sql
 * - 003_sales_tables.sql
 * - 004_indexes.sql
 * - 005_triggers.sql
 * - 006_create_sale.sql
 * - 007_rls.sql
 * - 008_inventory_audit_bulk.sql
 * - 009_quote_sale.sql
 * - 010_sms.sql
 * - 011_stock_levels.sql
 * - 012_purchasing.sql
 * - 013_loyalty.sql
 * - 014_returns_shifts.sql
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'owner' | 'manager' | 'cashier';
export type MovementType =
  | 'opening'
  | 'purchase'
  | 'sale'
  | 'sale_void'
  | 'return'
  | 'adjustment'
  | 'damage'
  | 'stocktake';
export type SaleStatus = 'completed' | 'voided' | 'partially_returned' | 'returned';
export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'store_credit';
export type SmsStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
export type PurchaseStatus = 'draft' | 'received' | 'cancelled';
export type ShiftStatus = 'open' | 'closed';
export type ProductUnit = 'pcs' | 'kg' | 'g' | 'l' | 'ml' | 'pack' | 'box';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: UserRole;
          phone: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          role?: UserRole;
          phone?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          role?: UserRole;
          phone?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      shop_settings: {
        Row: {
          id: number;
          shop_name: string;
          address: string;
          phone: string;
          vat_reg_no: string | null;
          receipt_footer: string | null;
          tax_enabled: boolean;
          tax_rate_percent: number;
          tax_inclusive: boolean;
          sms_enabled: boolean;
          sms_template: string | null;
          max_cashier_discount_percent: number;
          low_stock_default: number;
          currency: string;
          loyalty_enabled: boolean;
          loyalty_points_per_100_lkr: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          shop_name?: string;
          address?: string;
          phone?: string;
          vat_reg_no?: string | null;
          receipt_footer?: string | null;
          tax_enabled?: boolean;
          tax_rate_percent?: number;
          tax_inclusive?: boolean;
          sms_enabled?: boolean;
          sms_template?: string | null;
          max_cashier_discount_percent?: number;
          low_stock_default?: number;
          currency?: string;
          loyalty_enabled?: boolean;
          loyalty_points_per_100_lkr?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          shop_name?: string;
          address?: string;
          phone?: string;
          vat_reg_no?: string | null;
          receipt_footer?: string | null;
          tax_enabled?: boolean;
          tax_rate_percent?: number;
          tax_inclusive?: boolean;
          sms_enabled?: boolean;
          sms_template?: string | null;
          max_cashier_discount_percent?: number;
          low_stock_default?: number;
          currency?: string;
          loyalty_enabled?: boolean;
          loyalty_points_per_100_lkr?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      categories: {
        Row: {
          id: string;
          name: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };

      products: {
        Row: {
          id: string;
          sku: string;
          barcode: string | null;
          name: string;
          category_id: string | null;
          unit: ProductUnit;
          allow_decimal_qty: boolean;
          cost_price_cents: number;
          selling_price_cents: number;
          tax_exempt: boolean;
          stock_qty: number;
          reorder_level: number;
          track_expiry: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sku: string;
          barcode?: string | null;
          name: string;
          category_id?: string | null;
          unit?: ProductUnit;
          allow_decimal_qty?: boolean;
          cost_price_cents?: number;
          selling_price_cents?: number;
          tax_exempt?: boolean;
          stock_qty?: number;
          reorder_level?: number;
          track_expiry?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          sku?: string;
          barcode?: string | null;
          name?: string;
          category_id?: string | null;
          unit?: ProductUnit;
          allow_decimal_qty?: boolean;
          cost_price_cents?: number;
          selling_price_cents?: number;
          tax_exempt?: boolean;
          stock_qty?: number;
          reorder_level?: number;
          track_expiry?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'products_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          }
        ];
      };

      stock_levels: {
        Row: {
          product_id: string;
          stock_qty: number;
          updated_at: string;
        };
        Insert: {
          product_id: string;
          stock_qty: number;
          updated_at?: string;
        };
        Update: {
          product_id?: string;
          stock_qty?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stock_levels_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: true;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          }
        ];
      };

      stock_batches: {
        Row: {
          id: string;
          product_id: string;
          batch_no: string;
          expiry_date: string;
          qty_remaining: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          batch_no: string;
          expiry_date: string;
          qty_remaining?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          batch_no?: string;
          expiry_date?: string;
          qty_remaining?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stock_batches_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          }
        ];
      };

      stock_movements: {
        Row: {
          id: string;
          product_id: string;
          movement_type: MovementType;
          qty_change: number;
          qty_after: number;
          reference_type: string | null;
          reference_id: string | null;
          reason: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          movement_type: MovementType;
          qty_change: number;
          qty_after: number;
          reference_type?: string | null;
          reference_id?: string | null;
          reason?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          movement_type?: MovementType;
          qty_change?: number;
          qty_after?: number;
          reference_type?: string | null;
          reference_id?: string | null;
          reason?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stock_movements_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          }
        ];
      };

      suppliers: {
        Row: {
          id: string;
          name: string;
          contact_person: string | null;
          phone: string | null;
          email: string | null;
          address: string | null;
          payment_terms_days: number;
          balance_cents: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          contact_person?: string | null;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          payment_terms_days?: number;
          balance_cents?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          contact_person?: string | null;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          payment_terms_days?: number;
          balance_cents?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      supplier_payments: {
        Row: {
          id: string;
          supplier_id: string;
          amount_cents: number;
          method: PaymentMethod;
          reference: string | null;
          paid_at: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          supplier_id: string;
          amount_cents: number;
          method: PaymentMethod;
          reference?: string | null;
          paid_at?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          supplier_id?: string;
          amount_cents?: number;
          method?: PaymentMethod;
          reference?: string | null;
          paid_at?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'supplier_payments_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          }
        ];
      };

      product_cost_history: {
        Row: {
          id: string;
          product_id: string;
          old_cost_cents: number;
          new_cost_cents: number;
          purchase_id: string | null;
          changed_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          old_cost_cents: number;
          new_cost_cents: number;
          purchase_id?: string | null;
          changed_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          old_cost_cents?: number;
          new_cost_cents?: number;
          purchase_id?: string | null;
          changed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'product_cost_history_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          }
        ];
      };

      customers: {
        Row: {
          id: string;
          name: string;
          phone: string;
          email: string | null;
          points_balance: number;
          credit_balance_cents: number;
          sms_opt_out: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone: string;
          email?: string | null;
          points_balance?: number;
          credit_balance_cents?: number;
          sms_opt_out?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string;
          email?: string | null;
          points_balance?: number;
          credit_balance_cents?: number;
          sms_opt_out?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };

      customer_points_ledger: {
        Row: {
          id: string;
          customer_id: string;
          sale_id: string | null;
          points: number;
          reason: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          sale_id?: string | null;
          points: number;
          reason: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          sale_id?: string | null;
          points?: number;
          reason?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'customer_points_ledger_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          }
        ];
      };

      purchases: {
        Row: {
          id: string;
          supplier_id: string;
          invoice_no: string | null;
          status: PurchaseStatus;
          total_cents: number;
          received_at: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          supplier_id: string;
          invoice_no?: string | null;
          status?: PurchaseStatus;
          total_cents?: number;
          received_at?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          supplier_id?: string;
          invoice_no?: string | null;
          status?: PurchaseStatus;
          total_cents?: number;
          received_at?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'purchases_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          }
        ];
      };

      purchase_items: {
        Row: {
          id: string;
          purchase_id: string;
          product_id: string;
          quantity: number;
          unit_cost_cents: number;
          batch_no: string | null;
          expiry_date: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          purchase_id: string;
          product_id: string;
          quantity: number;
          unit_cost_cents: number;
          batch_no?: string | null;
          expiry_date?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          purchase_id?: string;
          product_id?: string;
          quantity?: number;
          unit_cost_cents?: number;
          batch_no?: string | null;
          expiry_date?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'purchase_items_purchase_id_fkey';
            columns: ['purchase_id'];
            isOneToOne: false;
            referencedRelation: 'purchases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_items_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          }
        ];
      };

      shifts: {
        Row: {
          id: string;
          cashier_id: string;
          terminal_name: string;
          status: ShiftStatus;
          opened_at: string;
          opening_float_cents: number;
          closed_at: string | null;
          counted_cash_cents: number | null;
          expected_cash_cents: number | null;
          difference_cents: number | null;
          note: string | null;
          cash_sales_cents: number;
          cash_refunds_cents: number;
          cash_in_cents: number;
          cash_out_cents: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          cashier_id: string;
          terminal_name?: string;
          status?: ShiftStatus;
          opened_at?: string;
          opening_float_cents?: number;
          closed_at?: string | null;
          counted_cash_cents?: number | null;
          expected_cash_cents?: number | null;
          difference_cents?: number | null;
          note?: string | null;
          cash_sales_cents?: number;
          cash_refunds_cents?: number;
          cash_in_cents?: number;
          cash_out_cents?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          cashier_id?: string;
          terminal_name?: string;
          status?: ShiftStatus;
          opened_at?: string;
          opening_float_cents?: number;
          closed_at?: string | null;
          counted_cash_cents?: number | null;
          expected_cash_cents?: number | null;
          difference_cents?: number | null;
          note?: string | null;
          cash_sales_cents?: number;
          cash_refunds_cents?: number;
          cash_in_cents?: number;
          cash_out_cents?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shifts_cashier_id_fkey";
            columns: ["cashier_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };

      bill_counters: {
        Row: {
          bill_date: string;
          last_number: number;
          created_at: string;
        };
        Insert: {
          bill_date: string;
          last_number?: number;
          created_at?: string;
        };
        Update: {
          bill_date?: string;
          last_number?: number;
          created_at?: string;
        };
        Relationships: [];
      };

      sales: {
        Row: {
          id: string;
          bill_no: string;
          idempotency_key: string;
          shift_id: string;
          cashier_id: string;
          customer_id: string | null;
          customer_phone: string | null;
          status: SaleStatus;
          subtotal_cents: number;
          line_discount_cents: number;
          bill_discount_cents: number;
          taxable_cents: number;
          tax_cents: number;
          total_cents: number;
          tax_rate_percent_snapshot: number;
          tax_inclusive_snapshot: boolean;
          paid_cents: number;
          change_cents: number;
          print_count: number;
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          bill_no: string;
          idempotency_key: string;
          shift_id: string;
          cashier_id: string;
          customer_id?: string | null;
          customer_phone?: string | null;
          status?: SaleStatus;
          subtotal_cents: number;
          line_discount_cents?: number;
          bill_discount_cents?: number;
          taxable_cents: number;
          tax_cents?: number;
          total_cents: number;
          tax_rate_percent_snapshot?: number;
          tax_inclusive_snapshot?: boolean;
          paid_cents: number;
          change_cents?: number;
          print_count?: number;
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          bill_no?: string;
          idempotency_key?: string;
          shift_id?: string;
          cashier_id?: string;
          customer_id?: string | null;
          customer_phone?: string | null;
          status?: SaleStatus;
          subtotal_cents?: number;
          line_discount_cents?: number;
          bill_discount_cents?: number;
          taxable_cents?: number;
          tax_cents?: number;
          total_cents?: number;
          tax_rate_percent_snapshot?: number;
          tax_inclusive_snapshot?: boolean;
          paid_cents?: number;
          change_cents?: number;
          print_count?: number;
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sales_shift_id_fkey';
            columns: ['shift_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sales_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          }
        ];
      };

      sale_items: {
        Row: {
          id: string;
          sale_id: string;
          product_id: string;
          product_name_snapshot: string;
          sku_snapshot: string;
          unit_snapshot: string;
          quantity: number;
          unit_price_cents_snapshot: number;
          unit_cost_cents_snapshot: number;
          line_discount_cents: number;
          line_tax_cents: number;
          line_total_cents: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          sale_id: string;
          product_id: string;
          product_name_snapshot: string;
          sku_snapshot: string;
          unit_snapshot: string;
          quantity: number;
          unit_price_cents_snapshot: number;
          unit_cost_cents_snapshot?: number;
          line_discount_cents?: number;
          line_tax_cents?: number;
          line_total_cents: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          sale_id?: string;
          product_id?: string;
          product_name_snapshot?: string;
          sku_snapshot?: string;
          unit_snapshot?: string;
          quantity?: number;
          unit_price_cents_snapshot?: number;
          unit_cost_cents_snapshot?: number;
          line_discount_cents?: number;
          line_tax_cents?: number;
          line_total_cents?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sale_items_sale_id_fkey';
            columns: ['sale_id'];
            isOneToOne: false;
            referencedRelation: 'sales';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sale_items_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          }
        ];
      };

      sale_item_batches: {
        Row: {
          id: string;
          sale_item_id: string;
          batch_id: string;
          quantity: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          sale_item_id: string;
          batch_id: string;
          quantity: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          sale_item_id?: string;
          batch_id?: string;
          quantity?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sale_item_batches_sale_item_id_fkey';
            columns: ['sale_item_id'];
            isOneToOne: false;
            referencedRelation: 'sale_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sale_item_batches_batch_id_fkey';
            columns: ['batch_id'];
            isOneToOne: false;
            referencedRelation: 'stock_batches';
            referencedColumns: ['id'];
          }
        ];
      };

      payments: {
        Row: {
          id: string;
          sale_id: string;
          method: PaymentMethod;
          amount_cents: number;
          reference: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sale_id: string;
          method: PaymentMethod;
          amount_cents: number;
          reference?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          sale_id?: string;
          method?: PaymentMethod;
          amount_cents?: number;
          reference?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_sale_id_fkey';
            columns: ['sale_id'];
            isOneToOne: false;
            referencedRelation: 'sales';
            referencedColumns: ['id'];
          }
        ];
      };

      sale_returns: {
        Row: {
          id: string;
          sale_id: string;
          shift_id: string | null;
          return_no: string;
          reason: string;
          refund_method: PaymentMethod;
          refund_cents: number;
          restock: boolean;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sale_id: string;
          shift_id?: string | null;
          return_no: string;
          reason: string;
          refund_method: PaymentMethod;
          refund_cents: number;
          restock?: boolean;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          sale_id?: string;
          shift_id?: string | null;
          return_no?: string;
          reason?: string;
          refund_method?: PaymentMethod;
          refund_cents?: number;
          restock?: boolean;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sale_returns_sale_id_fkey';
            columns: ['sale_id'];
            isOneToOne: false;
            referencedRelation: 'sales';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sale_returns_shift_id_fkey';
            columns: ['shift_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id'];
          }
        ];
      };

      sale_return_items: {
        Row: {
          id: string;
          return_id: string;
          sale_item_id: string;
          quantity: number;
          refund_cents: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          return_id: string;
          sale_item_id: string;
          quantity: number;
          refund_cents: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          return_id?: string;
          sale_item_id?: string;
          quantity?: number;
          refund_cents?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sale_return_items_return_id_fkey';
            columns: ['return_id'];
            isOneToOne: false;
            referencedRelation: 'sale_returns';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sale_return_items_sale_item_id_fkey';
            columns: ['sale_item_id'];
            isOneToOne: false;
            referencedRelation: 'sale_items';
            referencedColumns: ['id'];
          }
        ];
      };

      return_counters: {
        Row: {
          return_date: string;
          last_number: number;
          created_at: string;
        };
        Insert: {
          return_date: string;
          last_number?: number;
          created_at?: string;
        };
        Update: {
          return_date?: string;
          last_number?: number;
          created_at?: string;
        };
        Relationships: [];
      };

      sms_outbox: {
        Row: {
          id: string;
          sale_id: string | null;
          phone: string;
          message: string;
          status: SmsStatus;
          attempts: number;
          last_error: string | null;
          provider_message_id: string | null;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sale_id?: string | null;
          phone: string;
          message: string;
          status?: SmsStatus;
          attempts?: number;
          last_error?: string | null;
          provider_message_id?: string | null;
          sent_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          sale_id?: string | null;
          phone?: string;
          message?: string;
          status?: SmsStatus;
          attempts?: number;
          last_error?: string | null;
          provider_message_id?: string | null;
          sent_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sms_outbox_sale_id_fkey';
            columns: ['sale_id'];
            isOneToOne: false;
            referencedRelation: 'sales';
            referencedColumns: ['id'];
          }
        ];
      };

      held_carts: {
        Row: {
          id: string;
          cashier_id: string;
          label: string;
          cart_json: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          cashier_id: string;
          label: string;
          cart_json: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          cashier_id?: string;
          label?: string;
          cart_json?: Json;
          created_at?: string;
        };
        Relationships: [];
      };

      cash_movements: {
        Row: {
          id: string;
          shift_id: string;
          kind: 'cash_in' | 'cash_out';
          amount_cents: number;
          reason: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          shift_id: string;
          kind: 'cash_in' | 'cash_out';
          amount_cents: number;
          reason: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          shift_id?: string;
          kind?: 'cash_in' | 'cash_out';
          amount_cents?: number;
          reason?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cash_movements_shift_id_fkey';
            columns: ['shift_id'];
            isOneToOne: false;
            referencedRelation: 'shifts';
            referencedColumns: ['id'];
          }
        ];
      };

      audit_log: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          table_name: string;
          record_id: string | null;
          old_data: Json | null;
          new_data: Json | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          table_name: string;
          record_id?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          action?: string;
          table_name?: string;
          record_id?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };

    Views: {
      pos_products: {
        Row: {
          id: string;
          sku: string;
          barcode: string | null;
          name: string;
          category_id: string | null;
          unit: ProductUnit;
          allow_decimal_qty: boolean;
          selling_price_cents: number;
          tax_exempt: boolean;
          stock_qty: number;
          is_active: boolean;
        };
        Relationships: [];
      };
    };

    Functions: {
      current_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: UserRole | null;
      };
      is_staff: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_manager_or_owner: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_owner: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      adjust_stock: {
        Args: {
          p_product_id: string;
          p_qty_change: number;
          p_reason: string;
          p_type?: MovementType;
        };
        Returns: Json;
      };
      create_sale: {
        Args: {
          p_idempotency_key: string;
          p_items: Json;
          p_bill_discount: Json;
          p_payments: Json;
          p_customer_phone?: string | null;
          p_customer_name?: string | null;
        };
        Returns: Json;
      };
      get_bill: {
        Args: {
          p_sale_id: string;
        };
        Returns: Json;
      };
      mark_bill_printed: {
        Args: {
          p_sale_id: string;
        };
        Returns: Json;
      };
      round_half_up: {
        Args: {
          numerator: number;
          denominator: number;
        };
        Returns: number;
      };
      normalize_phone_number: {
        Args: {
          p_phone: string;
        };
        Returns: string;
      };
      bulk_import_products: {
        Args: {
          p_products: Json;
        };
        Returns: Json;
      };
      bulk_stocktake: {
        Args: {
          p_adjustments: Json;
        };
        Returns: Json;
      };
      calc_bill: {
        Args: {
          p_items: Json;
          p_bill_discount?: Json;
          p_lock_products?: boolean;
        };
        Returns: Json;
      };
      quote_sale: {
        Args: {
          p_items: Json;
          p_bill_discount?: Json;
        };
        Returns: Json;
      };
      receive_purchase: {
        Args: {
          p_supplier_id: string;
          p_invoice_no: string;
          p_items: Json;
          p_paid_cents?: number;
          p_pay_method?: PaymentMethod;
        };
        Returns: Json;
      };
      record_supplier_payment: {
        Args: {
          p_supplier_id: string;
          p_amount_cents: number;
          p_method: PaymentMethod;
          p_reference?: string | null;
        };
        Returns: Json;
      };
      cancel_purchase: {
        Args: {
          p_purchase_id: string;
          p_reason?: string;
        };
        Returns: Json;
      };
      open_shift: {
        Args: {
          p_opening_float_cents: number;
          p_terminal_name?: string;
        };
        Returns: Json;
      };
      close_shift: {
        Args: {
          p_counted_cash_cents: number;
          p_note?: string | null;
          p_shift_id?: string | null;
        };
        Returns: Json;
      };
      x_report: {
        Args: {
          p_shift_id?: string | null;
        };
        Returns: Json;
      };
      record_cash_movement: {
        Args: {
          p_shift_id: string;
          p_kind: string;
          p_amount_cents: number;
          p_reason: string;
        };
        Returns: Json;
      };
      void_sale: {
        Args: {
          p_sale_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      create_return: {
        Args: {
          p_sale_id: string;
          p_items: Json;
          p_reason: string;
          p_refund_method: PaymentMethod;
          p_restock?: boolean;
        };
        Returns: Json;
      };
      get_return: {
        Args: {
          p_return_id: string;
        };
        Returns: Json;
      };
      report_daily_summary: {
        Args: {
          p_from: string;
          p_to: string;
        };
        Returns: Json[];
      };
      report_sales_by_product: {
        Args: {
          p_from: string;
          p_to: string;
          p_category_id?: string | null;
        };
        Returns: Json[];
      };
      report_sales_by_category: {
        Args: {
          p_from: string;
          p_to: string;
        };
        Returns: Json[];
      };
      report_sales_by_cashier: {
        Args: {
          p_from: string;
          p_to: string;
        };
        Returns: Json[];
      };
      report_sales_by_hour: {
        Args: {
          p_from: string;
          p_to: string;
        };
        Returns: Json[];
      };
      report_profit: {
        Args: {
          p_from: string;
          p_to: string;
        };
        Returns: Json[];
      };
      report_stock_valuation: {
        Args: Record<PropertyKey, never>;
        Returns: Json[];
      };
      report_low_stock: {
        Args: Record<PropertyKey, never>;
        Returns: Json[];
      };
      report_dead_stock: {
        Args: {
          p_days?: number;
        };
        Returns: Json[];
      };
      report_expiry: {
        Args: {
          p_days?: number;
        };
        Returns: Json[];
      };
      report_tax: {
        Args: {
          p_from: string;
          p_to: string;
        };
        Returns: Json[];
      };
      report_returns_voids: {
        Args: {
          p_from: string;
          p_to: string;
        };
        Returns: Json[];
      };
      report_supplier_balances: {
        Args: Record<PropertyKey, never>;
        Returns: Json[];
      };
      report_top_customers: {
        Args: {
          p_from: string;
          p_to: string;
          p_limit?: number;
        };
        Returns: Json[];
      };
      report_sms: {
        Args: {
          p_from: string;
          p_to: string;
        };
        Returns: Json[];
      };
      report_reconciliation: {
        Args: {
          p_from: string;
          p_to: string;
        };
        Returns: Json;
      };
      report_dashboard_summary: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
    };
    Enums: {
      user_role: UserRole;
      movement_type: MovementType;
      sale_status: SaleStatus;
      payment_method: PaymentMethod;
      sms_status: SmsStatus;
      purchase_status: PurchaseStatus;
      shift_status: ShiftStatus;
    };
  };
}
