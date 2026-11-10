import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchShopSettings, ShopSettings } from '../api/settings';

export function useShopSettings() {
  let hasClient = true;
  try {
    useQueryClient();
  } catch {
    hasClient = false;
  }

  if (!hasClient) {
    return {
      settings: null,
      shopName: 'Wewala Super Store',
      isLoading: false,
      error: null,
    };
  }

  const query = useQuery<ShopSettings | null>({
    queryKey: ['shop-settings'],
    queryFn: fetchShopSettings,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });

  return {
    settings: query.data,
    shopName: query.data?.shop_name || 'Wewala Super Store',
    isLoading: query.isLoading,
    error: query.error,
  };
}

