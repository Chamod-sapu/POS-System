import { Page, BrowserContext } from '@playwright/test';

export interface MockSupabaseOptions {
  currentRole?: 'cashier' | 'manager' | 'owner';
}

/**
 * Sets up Playwright network route interception for Supabase Auth and PostgREST endpoints.
 * This guarantees reliable, deterministic execution in CI and offline test environments
 * where a dedicated Supabase server instance is not running.
 */
export async function setupMockSupabase(pageOrContext: Page | BrowserContext, options?: MockSupabaseOptions) {
  let activeUser = {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'cashier@wewala.lk',
    role: options?.currentRole || 'cashier',
    name: 'Cashier One',
  };

  // Intercept Auth endpoints (/auth/v1/...)
  await pageOrContext.route('**/auth/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/token') && method === 'POST') {
      let postData: Record<string, string> = {};
      try {
        postData = route.request().postDataJSON() || {};
      } catch {
        // fallback
      }

      const email = (postData.email || '').toLowerCase();
      if (email.includes('manager')) {
        activeUser = {
          id: '33333333-3333-3333-3333-333333333333',
          email: postData.email || 'manager@wewala.lk',
          role: 'manager',
          name: 'Store Manager',
        };
      } else if (email.includes('owner')) {
        activeUser = {
          id: '11111111-1111-1111-1111-111111111111',
          email: postData.email || 'owner@wewala.lk',
          role: 'owner',
          name: 'Store Owner',
        };
      } else {
        activeUser = {
          id: '22222222-2222-2222-2222-222222222222',
          email: postData.email || 'cashier@wewala.lk',
          role: 'cashier',
          name: 'Cashier One',
        };
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        },
        body: JSON.stringify({
          access_token: 'mock-valid-jwt-token-for-e2e',
          token_type: 'bearer',
          expires_in: 86400,
          expires_at: Math.floor(Date.now() / 1000) + 86400,
          refresh_token: 'mock-refresh-token',
          user: {
            id: activeUser.id,
            aud: 'authenticated',
            role: 'authenticated',
            email: activeUser.email,
            phone: null,
            app_metadata: { provider: 'email', providers: ['email'] },
            user_metadata: { full_name: activeUser.name },
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        }),
      });
    }

    if (url.includes('/user')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        },
        body: JSON.stringify({
          id: activeUser.id,
          aud: 'authenticated',
          role: 'authenticated',
          email: activeUser.email,
          user_metadata: { full_name: activeUser.name },
        }),
      });
    }

    if (url.includes('/factors')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        },
        body: JSON.stringify({ all: [], totp: [] }),
      });
    }

    if (url.includes('/aal')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        },
        body: JSON.stringify({ current_level: 'aal1', next_level: 'aal1' }),
      });
    }

    if (url.includes('/logout')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        },
        body: '{}',
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
      body: '{}',
    });
  });

  // Intercept PostgREST endpoints (/rest/v1/...)
  await pageOrContext.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    const headers = route.request().headers();
    const accept = headers['accept'] || '';
    const isSingle = accept.includes('application/vnd.pgrst.object+json');

    // 1. Profiles Table
    if (url.includes('/profiles')) {
      let role = activeUser.role;
      let name = activeUser.name;
      let id = activeUser.id;

      if (url.includes('33333333-3333-3333-3333-333333333333')) {
        role = 'manager';
        name = 'Store Manager';
        id = '33333333-3333-3333-3333-333333333333';
      } else if (url.includes('11111111-1111-1111-1111-111111111111')) {
        role = 'owner';
        name = 'Store Owner';
        id = '11111111-1111-1111-1111-111111111111';
      } else if (url.includes('22222222-2222-2222-2222-222222222222')) {
        role = 'cashier';
        name = 'Cashier One';
        id = '22222222-2222-2222-2222-222222222222';
      }

      const profile = {
        id,
        full_name: name,
        role,
        phone: null,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        },
        body: JSON.stringify(isSingle ? profile : [profile]),
      });
    }

    // 2. Shop Settings
    if (url.includes('/shop_settings')) {
      const settings = {
        id: '1',
        shop_name: 'Wewala Super Store',
        address: '123 Main St, Wewala',
        phone: '0112345678',
        tax_id: 'TAX-123456',
        tax_rate_percent: 0,
        default_tax_inclusive: true,
        currency: 'LKR',
        receipt_footer: 'Thank you for shopping with us!',
      };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        },
        body: JSON.stringify(isSingle ? settings : [settings]),
      });
    }

    // 3. Shifts
    if (url.includes('/shifts')) {
      const shift = {
        id: 'shift-123',
        cashier_id: activeUser.id,
        status: 'open',
        opening_float_cents: 250000,
        opened_at: new Date().toISOString(),
        closed_at: null,
        notes: null,
      };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        },
        body: JSON.stringify(isSingle ? shift : [shift]),
      });
    }

    // 3b. Categories Table
    if (url.includes('/categories')) {
      const categories = [
        { id: 'cat-grains', name: 'Grains & Rice', is_active: true },
        { id: 'cat-dairy', name: 'Dairy & Eggs', is_active: true },
        { id: 'cat-beverages', name: 'Beverages & Tea', is_active: true },
      ];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        },
        body: JSON.stringify(isSingle ? categories[0] : categories),
      });
    }

    // 4. Products & POS Products View
    if (url.includes('/pos_products') || url.includes('/products')) {
      const products = [
        {
          id: 'prod-1',
          sku: '9990001',
          barcode: '9990001',
          name: 'Keeri Samba Rice 1kg',
          selling_price_cents: 28000,
          cost_price_cents: 22000,
          stock_qty: 50,
          is_active: true,
          allow_decimal_qty: false,
          category_id: null,
          brand: 'Wewala',
          unit: 'kg',
          reorder_level: 10,
        },
        {
          id: 'prod-2',
          sku: '9990002',
          barcode: '9990002',
          name: 'White Sugar 1kg',
          selling_price_cents: 24000,
          cost_price_cents: 19000,
          stock_qty: 40,
          is_active: true,
          allow_decimal_qty: false,
          category_id: null,
          brand: 'Wewala',
          unit: 'kg',
          reorder_level: 10,
        },
        {
          id: 'prod-3',
          sku: '9990003',
          barcode: '9990003',
          name: 'Dhal 500g',
          selling_price_cents: 16000,
          cost_price_cents: 12000,
          stock_qty: 30,
          is_active: true,
          allow_decimal_qty: false,
          category_id: null,
          brand: 'Wewala',
          unit: 'packet',
          reorder_level: 10,
        },
        {
          id: 'prod-4',
          sku: '9990004',
          barcode: '9990004',
          name: 'Potatoes (Loose)',
          selling_price_cents: 35000,
          cost_price_cents: 28000,
          stock_qty: 100,
          is_active: true,
          allow_decimal_qty: true,
          category_id: null,
          brand: 'Wewala',
          unit: 'kg',
          reorder_level: 15,
        },
        {
          id: 'prod-rice',
          sku: 'TEST-RICE',
          barcode: 'TEST-RICE',
          name: 'Rice 1kg',
          selling_price_cents: 25000,
          cost_price_cents: 20000,
          stock_qty: 10,
          is_active: true,
          allow_decimal_qty: false,
          category_id: null,
          brand: 'Wewala',
          unit: 'kg',
          reorder_level: 5,
        },
      ];

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Content-Range': '0-4/5',
        },
        body: JSON.stringify(products),
      });
    }

    // 5. RPC quote_sale
    if (url.includes('/rpc/quote_sale')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        },
        body: JSON.stringify({
          lines: [
            {
              product_id: 'prod-1',
              product_name: 'Keeri Samba Rice 1kg',
              quantity: 1,
              unit_price_cents: 28000,
              line_total_cents: 28000,
              discount_cents: 0,
            },
          ],
          subtotal_cents: 28000,
          line_discount_cents: 0,
          bill_discount_cents: 0,
          total_discount_cents: 0,
          tax: { rate_percent: 0, mode: 'exclusive', taxable_cents: 28000, tax_cents: 0 },
          total_cents: 28000,
          warnings: [],
        }),
      });
    }

    // 6. RPC create_sale
    if (url.includes('/rpc/create_sale')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        },
        body: JSON.stringify({
          id: 'sale-001',
          bill_no: 'WWL-20261111-0001',
          subtotal_cents: 28000,
          line_discount_cents: 0,
          bill_discount_cents: 0,
          tax: { rate_percent: 0, mode: 'exclusive', taxable_cents: 28000, tax_cents: 0 },
          total_cents: 28000,
          paid_cents: 28000,
          change_cents: 0,
          payment_status: 'PAID',
          created_at: new Date().toISOString(),
          customer: null,
          lines: [
            {
              product_id: 'prod-1',
              name: 'Keeri Samba Rice 1kg',
              quantity: 1,
              unit_price_cents: 28000,
              line_discount_cents: 0,
              line_total_cents: 28000,
            },
          ],
          payments: [
            {
              method: 'cash',
              amount_cents: 28000,
            },
          ],
          shop: {
            name: 'Wewala Store',
            address: '123 Main St, Wewala',
            phone: '0112345678',
          },
        }),
      });
    }

    // 7. RPC mark_bill_printed
    if (url.includes('/rpc/mark_bill_printed')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        },
        body: JSON.stringify({
          success: true,
          print_count: 2,
          is_duplicate: true,
        }),
      });
    }

    // 7b. RPC x_report
    if (url.includes('/rpc/x_report')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        },
        body: JSON.stringify({
          shift_id: 'shift-123',
          terminal_name: 'Main Terminal',
          cashier_name: activeUser.name,
          status: 'open',
          opened_at: '2026-01-01T08:00:00Z',
          generated_at: new Date().toISOString(),
          opening_float_cents: 250000,
          sales_count: 1,
          cash_sales_cents: 28000,
          card_sales_cents: 0,
          transfer_sales_cents: 0,
          credit_sales_cents: 0,
          cash_refunds_cents: 0,
          cash_in_cents: 0,
          cash_out_cents: 0,
          expected_cash_cents: 278000,
        }),
      });
    }

    // 7c. RPC open_shift
    if (url.includes('/rpc/open_shift')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        },
        body: JSON.stringify({
          id: 'shift-123',
          cashier_id: activeUser.id,
          status: 'open',
          terminal_name: 'Main Terminal',
          opening_float_cents: 250000,
          opened_at: new Date().toISOString(),
          closed_at: null,
          notes: null,
        }),
      });
    }

    // 7d. RPC close_shift
    if (url.includes('/rpc/close_shift')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        },
        body: JSON.stringify({
          id: 'shift-123',
          shift_id: 'shift-123',
          cashier_id: activeUser.id,
          cashier_name: activeUser.name,
          terminal_name: 'Main Terminal',
          opened_at: '2026-01-01T08:00:00Z',
          closed_at: new Date().toISOString(),
          opening_float_cents: 250000,
          cash_sales_cents: 28000,
          change_given_cents: 0,
          net_cash_sales_cents: 28000,
          cash_refunds_cents: 0,
          cash_in_cents: 0,
          cash_out_cents: 0,
          expected_cash_cents: 278000,
          counted_cash_cents: 278000,
          difference_cents: 0,
          note: null,
        }),
      });
    }

    // 8. Sales table
    if (url.includes('/sales')) {
      const sales = [
        {
          id: 'sale-001',
          bill_no: 'WWL-20261111-0001',
          total_cents: 28000,
          subtotal_cents: 28000,
          discount_cents: 0,
          tax_cents: 0,
          paid_cents: 28000,
          change_cents: 0,
          payment_status: 'PAID',
          status: 'completed',
          print_count: 1,
          created_at: new Date().toISOString(),
          cashier_id: activeUser.id,
        },
      ];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Content-Range': '0-0/1',
        },
        body: JSON.stringify(isSingle ? sales[0] : sales),
      });
    }

    // Default empty array for other tables
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
      body: JSON.stringify(isSingle ? {} : []),
    });
  });
}
