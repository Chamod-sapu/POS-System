import { describe, it, expect } from 'vitest';
import { getMissingSupabaseEnv, assertSupabaseEnv, getSupabaseClient } from './supabase';

describe('supabase client configuration', () => {
  it('detects missing environment variables when unconfigured', () => {
    const missing = getMissingSupabaseEnv('', '');
    expect(missing).toContain('VITE_SUPABASE_URL');
    expect(missing).toContain('VITE_SUPABASE_ANON_KEY');

    const missingUrlOnly = getMissingSupabaseEnv('', 'some-key');
    expect(missingUrlOnly).toEqual(['VITE_SUPABASE_URL']);

    const missingKeyOnly = getMissingSupabaseEnv('https://example.supabase.co', '');
    expect(missingKeyOnly).toEqual(['VITE_SUPABASE_ANON_KEY']);

    const noneMissing = getMissingSupabaseEnv('https://example.supabase.co', 'some-key');
    expect(noneMissing).toEqual([]);
  });

  it('assertSupabaseEnv throws clear error detailing missing variables', () => {
    expect(() => assertSupabaseEnv('', '')).toThrowError(
      /Missing required Supabase environment variable\(s\): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY/
    );

    expect(() => assertSupabaseEnv('https://example.supabase.co', '')).toThrowError(
      /Missing required Supabase environment variable\(s\): VITE_SUPABASE_ANON_KEY/
    );
  });

  it('builds a valid client when credentials are provided', () => {
    const client = getSupabaseClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe('function');
  });
});
