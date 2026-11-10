-- ==============================================================================
-- Master Fix Script: supabase/fix_auth_users.sql
-- Description: Completely fixes Supabase GoTrue "500: Database error querying schema"
--              and resolves PostgreSQL "ERROR 23505: users_phone_key duplicate key".
-- Safe to run repeatedly. Creates or updates all 3 staff accounts with Password123!
-- ==============================================================================

BEGIN;

-- 1. Reset any empty string phones to NULL to satisfy users_phone_key UNIQUE constraint.
-- In PostgreSQL, multiple NULL values are allowed in a unique index, but multiple '' collide.
UPDATE auth.users
SET phone = NULL
WHERE phone = '';

-- 2. Insert default accounts if they do not exist yet
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  phone,
  phone_change,
  phone_change_token,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'owner@wewala.lk',
  crypt('Password123!', gen_salt('bf')),
  now(),
  '', '', '', '', NULL, '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Store Owner"}'::jsonb,
  now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'owner@wewala.lk');

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  phone,
  phone_change,
  phone_change_token,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222222',
  'authenticated',
  'authenticated',
  'manager@wewala.lk',
  crypt('Password123!', gen_salt('bf')),
  now(),
  '', '', '', '', NULL, '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Store Manager"}'::jsonb,
  now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'manager@wewala.lk');

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  phone,
  phone_change,
  phone_change_token,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  '33333333-3333-3333-3333-333333333333',
  'authenticated',
  'authenticated',
  'cashier@wewala.lk',
  crypt('Password123!', gen_salt('bf')),
  now(),
  '', '', '', '', NULL, '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Kasun Perera"}'::jsonb,
  now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'cashier@wewala.lk');

-- 3. Populate required GoTrue string tokens (non-null), keep phone NULL, and set password
UPDATE auth.users
SET 
  encrypted_password = crypt('Password123!', gen_salt('bf')),
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone = NULL,
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  raw_app_meta_data = COALESCE(raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
  raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb),
  aud = 'authenticated',
  role = 'authenticated'
WHERE email IN ('owner@wewala.lk', 'manager@wewala.lk', 'cashier@wewala.lk');

-- 4. Populate auth.identities for each user (required by Supabase GoTrue Auth)
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT 
  id,
  id,
  jsonb_build_object('sub', id::text, 'email', email),
  'email',
  id::text,
  now(),
  now(),
  now()
FROM auth.users
WHERE email IN ('owner@wewala.lk', 'manager@wewala.lk', 'cashier@wewala.lk')
ON CONFLICT (provider, provider_id) DO NOTHING;

-- 5. Ensure public.profiles are active with correct roles
INSERT INTO public.profiles (id, full_name, role, is_active)
SELECT id, 'Store Owner', 'owner', true
FROM auth.users WHERE email = 'owner@wewala.lk'
ON CONFLICT (id) DO UPDATE SET role = 'owner', is_active = true;

INSERT INTO public.profiles (id, full_name, role, is_active)
SELECT id, 'Store Manager', 'manager', true
FROM auth.users WHERE email = 'manager@wewala.lk'
ON CONFLICT (id) DO UPDATE SET role = 'manager', is_active = true;

INSERT INTO public.profiles (id, full_name, role, is_active)
SELECT id, 'Kasun Perera', 'cashier', true
FROM auth.users WHERE email = 'cashier@wewala.lk'
ON CONFLICT (id) DO UPDATE SET role = 'cashier', is_active = true;

COMMIT;
