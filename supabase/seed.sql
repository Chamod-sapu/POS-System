-- ==============================================================================
-- Seed: supabase/seed.sql
-- Description: Initial seed data for Wewala POS:
--              - Shop settings (Wewala Super Store)
--              - 6 Standard Grocery Categories
--              - 20 Realistic Sri Lankan grocery products (including 2 weighed items)
-- ==============================================================================

-- 1. SHOP SETTINGS
INSERT INTO shop_settings (
  id,
  shop_name,
  address,
  phone,
  vat_reg_no,
  receipt_footer,
  tax_enabled,
  tax_rate_percent,
  tax_inclusive,
  sms_enabled,
  sms_template,
  max_cashier_discount_percent,
  low_stock_default,
  currency
) VALUES (
  1,
  'Wewala Super Store',
  'No. 42, Main Road, Wewala, Sri Lanka',
  '+94112345678',
  'VAT-11928374-7000',
  'Thank you for shopping at Wewala Super Store! Returns accepted within 7 days with valid receipt.',
  false,
  0.00,
  true,
  true,
  'Thank you for shopping at Wewala Super Store. Bill: {bill_no}, Total: {total}. We look forward to serving you again!',
  5.00,
  5.000,
  'LKR'
)
ON CONFLICT (id) DO UPDATE SET
  shop_name = EXCLUDED.shop_name,
  address = EXCLUDED.address,
  phone = EXCLUDED.phone,
  receipt_footer = EXCLUDED.receipt_footer,
  updated_at = now();

-- 2. CATEGORIES (6 Standard Retail Categories)
INSERT INTO categories (id, name, is_active) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'Grains, Rice & Flour', true),
  ('c1000000-0000-0000-0000-000000000002', 'Dairy & Eggs', true),
  ('c1000000-0000-0000-0000-000000000003', 'Beverages & Tea', true),
  ('c1000000-0000-0000-0000-000000000004', 'Biscuits & Confectionery', true),
  ('c1000000-0000-0000-0000-000000000005', 'Household & Personal Care', true),
  ('c1000000-0000-0000-0000-000000000006', 'Spices, Condiments & Cooking', true)
ON CONFLICT (name) DO UPDATE SET is_active = true;

-- 3. PRODUCTS (20 Realistic Sri Lankan Grocery Products)
-- Note: All prices are in integer cents (e.g. Rs. 320.00 = 32000 cents)
INSERT INTO products (
  sku,
  barcode,
  name,
  category_id,
  unit,
  allow_decimal_qty,
  cost_price_cents,
  selling_price_cents,
  tax_exempt,
  stock_qty,
  reorder_level,
  track_expiry,
  is_active
) VALUES
  -- Weighed Goods (unit = 'kg', allow_decimal_qty = true)
  (
    'GRN-RICE-001',
    '200000100000',
    'Keeri Samba Rice (Loose)',
    'c1000000-0000-0000-0000-000000000001',
    'kg',
    true,
    28000,
    32000,
    true,
    250.000,
    50.000,
    false,
    true
  ),
  (
    'GRN-RICE-002',
    '200000200000',
    'Red Raw Rice (Loose)',
    'c1000000-0000-0000-0000-000000000001',
    'kg',
    true,
    19000,
    22000,
    true,
    300.000,
    50.000,
    false,
    true
  ),

  -- Grains & Staples (Packaged)
  (
    'GRN-SUGR-001',
    '4792011000031',
    'White Sugar 1kg Pack',
    'c1000000-0000-0000-0000-000000000001',
    'pack',
    false,
    23000,
    26000,
    true,
    120.000,
    25.000,
    false,
    true
  ),
  (
    'GRN-DHAL-001',
    '4792011000048',
    'Mysore Dhal 1kg Pack',
    'c1000000-0000-0000-0000-000000000001',
    'pack',
    false,
    29500,
    34000,
    true,
    95.000,
    20.000,
    false,
    true
  ),

  -- Beverages & Tea
  (
    'BEV-TEA-001',
    '4791038000055',
    'Watawala Tea 100g',
    'c1000000-0000-0000-0000-000000000003',
    'pack',
    false,
    18000,
    21000,
    false,
    80.000,
    20.000,
    true,
    true
  ),
  (
    'BEV-TEA-002',
    '4791038000062',
    'Dilmah Premium Ceylon Tea 200g',
    'c1000000-0000-0000-0000-000000000003',
    'pack',
    false,
    42000,
    49000,
    false,
    45.000,
    15.000,
    true,
    true
  ),
  (
    'BEV-HERB-001',
    '4791038000192',
    'Link Samahan Herbal Drink 10 Sachets',
    'c1000000-0000-0000-0000-000000000003',
    'box',
    false,
    38000,
    44000,
    false,
    65.000,
    20.000,
    true,
    true
  ),
  (
    'BEV-COFF-001',
    '4791038000208',
    'Harischandra Pure Coffee Powder 200g',
    'c1000000-0000-0000-0000-000000000003',
    'pack',
    false,
    54000,
    62000,
    false,
    30.000,
    10.000,
    true,
    true
  ),

  -- Dairy & Chilled
  (
    'DAI-MILK-001',
    '4792003000078',
    'Anchor Full Cream Milk Powder 400g',
    'c1000000-0000-0000-0000-000000000002',
    'pack',
    false,
    95000,
    108000,
    true,
    60.000,
    15.000,
    true,
    true
  ),
  (
    'DAI-MILK-002',
    '4792003000085',
    'Highland Pasteurized Milk 1L',
    'c1000000-0000-0000-0000-000000000002',
    'pack',
    false,
    45000,
    52000,
    false,
    30.000,
    10.000,
    true,
    true
  ),
  (
    'DAI-BUTR-001',
    '4792003000092',
    'Astra Margarine 250g Tub',
    'c1000000-0000-0000-0000-000000000002',
    'pcs',
    false,
    36000,
    42000,
    false,
    50.000,
    15.000,
    true,
    true
  ),

  -- Biscuits & Confectionery
  (
    'BIS-CRAC-001',
    '4791024000109',
    'Munchee Super Cream Cracker 500g',
    'c1000000-0000-0000-0000-000000000004',
    'pack',
    false,
    48000,
    55000,
    false,
    75.000,
    20.000,
    true,
    true
  ),
  (
    'BIS-MARI-001',
    '4791024000116',
    'Maliban Gold Marie 400g',
    'c1000000-0000-0000-0000-000000000004',
    'pack',
    false,
    34000,
    39000,
    false,
    85.000,
    20.000,
    true,
    true
  ),

  -- Household & Personal Care
  (
    'HOU-SOAP-001',
    '4791001000123',
    'Sunlight Laundry Soap Bar 110g',
    'c1000000-0000-0000-0000-000000000005',
    'pcs',
    false,
    13500,
    16000,
    false,
    150.000,
    30.000,
    false,
    true
  ),
  (
    'HOU-DISH-001',
    '4791001000130',
    'Vim Dishwash Bar 100g',
    'c1000000-0000-0000-0000-000000000005',
    'pcs',
    false,
    11000,
    13000,
    false,
    110.000,
    25.000,
    false,
    true
  ),
  (
    'HOU-SOAP-002',
    '4791001000147',
    'Kohomba Herbal Beauty Soap 90g',
    'c1000000-0000-0000-0000-000000000005',
    'pcs',
    false,
    12000,
    14500,
    false,
    90.000,
    20.000,
    false,
    true
  ),

  -- Spices, Condiments & Cooking
  (
    'SPI-OIL-001',
    '4792015000154',
    'Marina Pure Coconut Oil 750ml Bottle',
    'c1000000-0000-0000-0000-000000000006',
    'pcs',
    false,
    65000,
    75000,
    false,
    40.000,
    10.000,
    false,
    true
  ),
  (
    'SPI-SAUC-001',
    '4792015000161',
    'Kist Tomato Sauce 400g Bottle',
    'c1000000-0000-0000-0000-000000000006',
    'pcs',
    false,
    37000,
    43000,
    false,
    35.000,
    10.000,
    true,
    true
  ),
  (
    'SPI-CHUT-001',
    '4792015000178',
    'MD Mango Chutney 400g Glass Jar',
    'c1000000-0000-0000-0000-000000000006',
    'pcs',
    false,
    41000,
    48000,
    false,
    25.000,
    8.000,
    true,
    true
  ),
  (
    'SPI-NOOD-001',
    '4792015000185',
    'Maggi 2-Minute Noodles Chicken 73g',
    'c1000000-0000-0000-0000-000000000006',
    'pack',
    false,
    13000,
    15000,
    false,
    140.000,
    30.000,
    true,
    true
  )
ON CONFLICT (sku) DO UPDATE SET
  selling_price_cents = EXCLUDED.selling_price_cents,
  cost_price_cents = EXCLUDED.cost_price_cents,
  stock_qty = EXCLUDED.stock_qty,
  barcode = EXCLUDED.barcode,
  updated_at = now();

