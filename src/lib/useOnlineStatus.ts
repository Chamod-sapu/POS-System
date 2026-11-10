import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

export interface OnlineStatus {
  isOnline: boolean;
  isChecking: boolean;
  lastChecked: Date | null;
  checkConnection: () => Promise<boolean>;
}

/**
 * Monitors browser connectivity (navigator.onLine) combined with
 * an active Supabase ping to ensure the database is genuinely reachable.
 */
export function useOnlineStatus(): OnlineStatus {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkConnection = useCallback(async (): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOnline(false);
      return false;
    }

    setIsChecking(true);
    try {
      // Lightweight read from shop_settings to verify Supabase connectivity
      const { error } = await supabase.from('shop_settings').select('id').limit(1);
      const online = !error;
      setIsOnline(online);
      setLastChecked(new Date());
      return online;
    } catch {
      setIsOnline(false);
      return false;
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      checkConnection();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial ping
    checkConnection();

    // Heartbeat every 45 seconds
    const interval = setInterval(checkConnection, 45_000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [checkConnection]);

  return { isOnline, isChecking, lastChecked, checkConnection };
}

