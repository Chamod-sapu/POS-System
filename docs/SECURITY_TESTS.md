# Wewala POS: Security & Penetration Testing Guide

This document details the penetration testing matrix, threat models, attack payloads, and defense validations across nine critical attack vectors using only an unauthenticated `anon` key or an untrusted `cashier` session token.

---

## Penetration Testing Matrix

| ID | Attack Vector | Attacker Context | Attack Payload / Action | Expected Result | Defense Mechanism |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **(a)** | Cost Price Snooping | Cashier / Anon | `SELECT cost_price_cents FROM products` | **Denied** (HTTP 403 / column excluded) | RLS policy + `pos_products` restricted view |
| **(b)** | Direct Price Modification | Cashier / Anon | `UPDATE products SET selling_price_cents = 1` | **Denied** (HTTP 403 / zero rows updated) | RLS update policy requires `is_manager_or_owner()` |
| **(c)** | Direct Stock Tampering | Manager / Cashier | `UPDATE products SET stock_qty = 999` | **Rejected** (`DIRECT_STOCK_WRITE_PROHIBITED`) | `trg_prevent_direct_stock_products` trigger requires `app.stock_write = 'on'` |
| **(d)** | IDOR Sale Snooping | Cashier A | `SELECT * FROM sales WHERE id = '<cashier_B_sale_id>'` | **Denied** (Empty result / HTTP 403) | RLS select policy requires `cashier_id = auth.uid()` |
| **(e)** | Direct Table Insertion | Cashier / Anon | `INSERT INTO sales (...) VALUES (...)` | **Denied** (HTTP 403) | RLS restricts direct INSERT; only `create_sale` SECURITY DEFINER allowed |
| **(f)** | Unauthorized Staff Admin | Cashier / Anon | `POST /functions/v1/admin-manage-staff` | **403 Forbidden** (`FORBIDDEN: Only active owners`) | Profile role verification in Edge Function |
| **(g)** | Malformed Quantities / Extreme Prices | Attacker | `create_sale` with qty: `-5`, `1e15`, price: `1e9` | **Rejected** (`VALIDATION_ERROR` / check constraint) | Parameter validation in Zod & database check constraints |
| **(h)** | SQL Injection in Search / Customer | Attacker | `'; DROP TABLE sales; --`, `' OR '1'='1` | **Handled Safely** (No execution, literal search) | Parameterized queries + PostgREST ilike sanitization |
| **(i)** | Replay Attack | Attacker | Duplicate `POST create_sale` with same `idempotency_key` | **Idempotent Return** (Same bill returned, no double charge) | Unique index on `idempotency_key` returns existing bill |

---

## Detailed Attack Scenarios & Executions

### 1. Attack (a): Reading Cost Prices
- **Scenario**: A cashier or anon user attempts to query wholesale cost prices from the database.
- **Request**:
  ```http
  GET /rest/v1/products?select=id,name,cost_price_cents HTTP/1.1
  Host: jcjpekkapiglvesaknmb.supabase.co
  Authorization: Bearer <CASHIER_OR_ANON_TOKEN>
  apikey: <ANON_KEY>
  ```
- **Result**: `403 Forbidden` or empty array. Cashiers are granted access solely to `pos_products`, which completely omits `cost_price_cents`.

### 2. Attack (b): Direct Price Modification
- **Scenario**: Cashier attempts to update a 5kg Basmati Rice bag to Rs. 10.00.
- **Request**:
  ```http
  PATCH /rest/v1/products?sku=eq.RIC-BAS-005 HTTP/1.1
  Authorization: Bearer <CASHIER_TOKEN>
  Content-Type: application/json

  {"selling_price_cents": 1000}
  ```
- **Result**: `403 Forbidden`. The `products` update policy mandates `is_manager_or_owner()`.

### 3. Attack (c): Direct Stock Quantity Manipulation
- **Scenario**: A malicious actor (or compromised manager session) attempts to bypass audit trails and set inventory levels directly.
- **Request**:
  ```http
  PATCH /rest/v1/products?id=eq.<PRODUCT_ID> HTTP/1.1
  Authorization: Bearer <MANAGER_TOKEN>
  Content-Type: application/json

  {"stock_qty": 9999}
  ```
- **Result**: `400 Bad Request` / PostgreSQL Exception:
  ```json
  {
    "code": "P0001",
    "message": "DIRECT_STOCK_WRITE_PROHIBITED: Direct updates to products.stock_qty are blocked. Use adjust_stock, create_sale, or receive_purchase."
  }
  ```

### 4. Attack (d): Insecure Direct Object Reference (IDOR) on Another Cashier's Bills
- **Scenario**: Cashier 1 attempts to query Bill `WWL-20261110-0042` created by Cashier 2.
- **Request**:
  ```http
  GET /rest/v1/sales?id=eq.<CASHIER_2_SALE_ID> HTTP/1.1
  Authorization: Bearer <CASHIER_1_TOKEN>
  ```
- **Result**: Returns `[]` (0 rows). RLS enforces `cashier_id = auth.uid()` for cashiers.

### 5. Attack (e): Direct Insertion into Financial Ledger Tables
- **Scenario**: Attacker bypasses the POS screen and tries to inject fake sales or payments directly into `sales` or `payments`.
- **Request**:
  ```http
  POST /rest/v1/sales HTTP/1.1
  Authorization: Bearer <CASHIER_TOKEN>
  Content-Type: application/json

  {"total_cents": 50000, "status": "completed"}
  ```
- **Result**: `403 Forbidden`. Direct table inserts are revoked. Sales must be processed via the atomic `create_sale` SECURITY DEFINER function.

### 6. Attack (f): Unauthorized Invocation of `admin-manage-staff`
- **Scenario**: Cashier attempts to call the administrative Edge Function to promote themselves to Owner.
- **Request**:
  ```http
  POST /functions/v1/admin-manage-staff HTTP/1.1
  Authorization: Bearer <CASHIER_TOKEN>
  Content-Type: application/json

  {"action": "set_role", "user_id": "<CASHIER_ID>", "new_role": "owner"}
  ```
- **Result**: `403 Forbidden`:
  ```json
  {
    "error": "FORBIDDEN",
    "message": "Access denied. Only active owners may manage staff."
  }
  ```

### 7. Attack (g): Extreme Price & Negative Quantity Payloads
- **Scenario**: Attacker invokes `create_sale` with negative quantities (`-500`), float overflow (`1e15`), or astronomical prices (`1e9`).
- **Result**: Blocked by Zod validation schemas on the client and PostgreSQL numeric bounds and `chk_line_quantity_positive` / `chk_prices_non_negative` constraints.

### 8. Attack (h): SQL Injection in Search Inputs
- **Scenario**: Attacker enters SQL injection strings into the product search bar or customer name field:
  - `Keeri'; DROP TABLE sales; --`
  - `' OR '1'='1`
  - `UNION SELECT password_hash FROM auth.users`
- **Result**: Queries use parameterized PostgREST `ilike.%term%` syntax. Special characters are escaped and treated as string literals. Zero SQL execution.

### 9. Attack (i): Replaying `create_sale` Requests
- **Scenario**: Network interruption causes client or proxy to replay the same bill creation payload twice.
- **Result**: The second request matches the existing `p_idempotency_key` in the `sales` table and safely returns the existing bill JSON without double-charging or deducting stock twice.

---

## Automated CI Penetration Tests

Run the full penetration test suite locally:
```bash
npx vitest run src/test/penetration.test.ts
```

