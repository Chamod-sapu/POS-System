import { supabase } from '../../../lib/supabase';
import { Database } from '../../../types/database';

export type ShopSettings = Database['public']['Tables']['shop_settings']['Row'];

export async function fetchShopSettings(): Promise<ShopSettings | null> {
  const { data, error } = await supabase
    .from('shop_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch shop settings:', error);
    return null;
  }

  return data;
}

export async function updateShopSettings(updates: Partial<ShopSettings>): Promise<ShopSettings> {
  const { data, error } = await supabase
    .from('shop_settings')
    .update(updates)
    .eq('id', 1)
    .select()
    .single();

  if (error) {
    console.error('Failed to update shop settings:', error);
    throw new Error(error.message);
  }

  return data;
}

