-- ==============================================================================
-- Security Audit Verification Test Suite: security_audit.sql
-- Fails with an exception if any security vulnerability is detected:
--   1. Any table in schema 'public' without Row Level Security enabled.
--   2. Any policy with USING (true) or WITH CHECK (true) on a write operation.
--   3. Any SECURITY DEFINER function without a fixed search_path.
--   4. Any table, view, or function with privileges granted to role 'anon'.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. ASSERT ALL TABLES IN SCHEMA 'public' HAVE RLS ENABLED & FORCED
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_unprotected_tables text;
BEGIN
  SELECT string_agg(tablename, ', ')
  INTO v_unprotected_tables
  FROM pg_tables
  WHERE schemaname = 'public'
    AND rowsecurity = false;

  IF v_unprotected_tables IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY AUDIT FAILED [RLS_MISSING]: Tables without Row Level Security in public schema: %', v_unprotected_tables;
  END IF;

  RAISE NOTICE 'CHECK 1 PASSED: All public tables have Row Level Security enabled.';
END $$;

-- ------------------------------------------------------------------------------
-- 2. ASSERT NO POLICY USES USING (true) OR WITH CHECK (true) ON WRITE ACTIONS
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_unsafe_policies text;
BEGIN
  SELECT string_agg(tablename || '.' || policyname || ' (' || cmd || ')', ', ')
  INTO v_unsafe_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    AND (
      qual = 'true' 
      OR with_check = 'true'
      OR qual = '(true)'
      OR with_check = '(true)'
    );

  IF v_unsafe_policies IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY AUDIT FAILED [UNSAFE_WRITE_POLICY]: Unsafe write policy permits unrestricted write access: %', v_unsafe_policies;
  END IF;

  RAISE NOTICE 'CHECK 2 PASSED: Zero policies use USING(true) or WITH CHECK(true) for writes.';
END $$;

-- ------------------------------------------------------------------------------
-- 3. ASSERT ALL SECURITY DEFINER FUNCTIONS HAVE A FIXED search_path
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_unfixed_functions text;
BEGIN
  SELECT string_agg(p.proname, ', ')
  INTO v_unfixed_functions
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND (
      p.proconfig IS NULL 
      OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'
      )
    );

  IF v_unfixed_functions IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY AUDIT FAILED [MISSING_SEARCH_PATH]: SECURITY DEFINER functions without search_path: %', v_unfixed_functions;
  END IF;

  RAISE NOTICE 'CHECK 3 PASSED: All SECURITY DEFINER functions declare a strict search_path.';
END $$;

-- ------------------------------------------------------------------------------
-- 4. ASSERT NO PRIVILEGES ARE GRANTED TO ROLE 'anon' ON TABLES, VIEWS OR ROUTINES
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_anon_table_grants text;
  v_anon_routine_grants text;
BEGIN
  -- Tables & Views
  SELECT string_agg(table_schema || '.' || table_name || ' (' || privilege_type || ')', ', ')
  INTO v_anon_table_grants
  FROM information_schema.role_table_grants
  WHERE grantee = 'anon'
    AND table_schema = 'public';

  IF v_anon_table_grants IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY AUDIT FAILED [ANON_TABLE_PRIVILEGES]: Privileges granted to anon on tables/views: %', v_anon_table_grants;
  END IF;

  -- Routines / Functions
  SELECT string_agg(routine_schema || '.' || routine_name || ' (' || privilege_type || ')', ', ')
  INTO v_anon_routine_grants
  FROM information_schema.role_routine_grants
  WHERE grantee = 'anon'
    AND routine_schema = 'public';

  IF v_anon_routine_grants IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY AUDIT FAILED [ANON_ROUTINE_PRIVILEGES]: Privileges granted to anon on routines: %', v_anon_routine_grants;
  END IF;

  RAISE NOTICE 'CHECK 4 PASSED: Role anon has zero privileges on schema public.';
END $$;

ROLLBACK;

