-- ==============================================================================
-- Script: supabase/seed_users.sql
-- Description: Complete seed script for Wewala POS demo staff accounts.
--              Fully complies with Supabase GoTrue schema (populates non-null token
--              strings and auth.identities) and keeps phone = NULL for uniqueness.
-- ==============================================================================

BEGIN;

-- Reset any empty string phones to NULL first
UPDATE auth.users SET phone = NULL WHERE phone = '';

-- 1. STORE OWNER
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
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'owner@wewala.lk',
  crypt('Password123!', gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  NULL,
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Store Owner"}'::jsonb,
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  encrypted_password = crypt('Password123!', gen_salt('bf')),
  email_confirmed_at = now(),
  confirmation_token = '',
  recovery_token = '',
  email_change = '',
  email_change_token_new = '',
  phone = NULL,
  phone_change = '',
  phone_change_token = '',
  reauthentication_token = '',
  raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb;

INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"owner@wewala.lk"}'::jsonb,
  'email',
  '11111111-1111-1111-1111-111111111111',
  now(),
  now(),
  now()
) ON CONFLICT (provider, provider_id) DO NOTHING;

INSERT INTO public.profiles (id, full_name, role, is_active)
VALUES ('11111111-1111-1111-1111-111111111111', 'Store Owner', 'owner', true)
ON CONFLICT (id) DO UPDATE SET role = 'owner', is_active = true;


-- 2. STORE MANAGER
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
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222222',
  'authenticated',
  'authenticated',
  'manager@wewala.lk',
  crypt('Password123!', gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  NULL,
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Store Manager"}'::jsonb,
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  encrypted_password = crypt('Password123!', gen_salt('bf')),
  email_confirmed_at = now(),
  confirmation_token = '',
  recovery_token = '',
  email_change = '',
  email_change_token_new = '',
  phone = NULL,
  phone_change = '',
  phone_change_token = '',
  reauthentication_token = '',
  raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb;

INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  '22222222-2222-2222-2222-222222222222',
  '{"sub":"22222222-2222-2222-2222-222222222222","email":"manager@wewala.lk"}'::jsonb,
  'email',
  '22222222-2222-2222-2222-222222222222',
  now(),
  now(),
  now()
) ON CONFLICT (provider, provider_id) DO NOTHING;

INSERT INTO public.profiles (id, full_name, role, is_active)
VALUES ('22222222-2222-2222-2222-222222222222', 'Store Manager', 'manager', true)
ON CONFLICT (id) DO UPDATE SET role = 'manager', is_active = true;


-- 3. CASHIER
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
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '33333333-3333-3333-3333-333333333333',
  'authenticated',
  'authenticated',
  'cashier@wewala.lk',
  crypt('Password123!', gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  NULL,
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Kasun Perera"}'::jsonb,
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  encrypted_password = crypt('Password123!', gen_salt('bf')),
  email_confirmed_at = now(),
  confirmation_token = '',
  recovery_token = '',
  email_change = '',
  email_change_token_new = '',
  phone = NULL,
  phone_change = '',
  phone_change_token = '',
  reauthentication_token = '',
  raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb;

INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  '33333333-3333-3333-3333-333333333333',
  '33333333-3333-3333-3333-333333333333',
  '{"sub":"33333333-3333-3333-3333-333333333333","email":"cashier@wewala.lk"}'::jsonb,
  'email',
  '33333333-3333-3333-3333-333333333333',
  now(),
  now(),
  now()
) ON CONFLICT (provider, provider_id) DO NOTHING;

INSERT INTO public.profiles (id, full_name, role, is_active)
VALUES ('33333333-3333-3333-3333-333333333333', 'Kasun Perera', 'cashier', true)
ON CONFLICT (id) DO UPDATE SET role = 'cashier', is_active = true;

COMMIT;
