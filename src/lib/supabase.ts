import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Checks for missing Supabase environment variables.
 * Returns an array of missing variable names.
 */
export function getMissingSupabaseEnv(
  url: string | undefined = import.meta.env.VITE_SUPABASE_URL,
  anonKey: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY
): string[] {
  const missing: string[] = [];
  if (!url || typeof url !== 'string' || url.trim() === '') {
    missing.push('VITE_SUPABASE_URL');
  }
  if (!anonKey || typeof anonKey !== 'string' || anonKey.trim() === '') {
    missing.push('VITE_SUPABASE_ANON_KEY');
  }
  return missing;
}

/**
 * Validates environment variables and throws an error stating which variable is missing.
 */
export function assertSupabaseEnv(
  url: string | undefined = import.meta.env.VITE_SUPABASE_URL,
  anonKey: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY
): { url: string; anonKey: string } {
  const missing = getMissingSupabaseEnv(url, anonKey);
  if (missing.length > 0) {
    throw new Error(
      `Missing required Supabase environment variable(s): ${missing.join(', ')}. ` +
      `Please configure ${missing.join(' and ')} in your .env.local file.`
    );
  }
  return { url: url as string, anonKey: anonKey as string };
}

let clientInstance: SupabaseClient<Database> | null = null;

/**
 * Builds or returns the singleton Supabase client.
 * If either VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing, throws a clear error.
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (clientInstance) {
    return clientInstance;
  }
  const { url, anonKey } = assertSupabaseEnv();
  clientInstance = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return clientInstance;
}

/**
 * Supabase client proxy that builds the client from env variables.
 * If either variable is missing, accessing any property throws a clear error.
 */
export const supabase: SupabaseClient<Database> = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    const client = getSupabaseClient();
    const value = Reflect.get(client, prop);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

