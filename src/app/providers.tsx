import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getMissingSupabaseEnv } from '../lib/supabase';
import { EnvErrorPage } from './EnvErrorPage';
import { AuthProvider } from '../features/auth/context/AuthContext';
import { IdleLock } from '../features/auth/components/IdleLock';
import { ToastProvider } from '../components/ui/Toast';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { ThemeProvider } from '../lib/theme';

interface AppProvidersProps {
  children: React.ReactNode;
}

export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
  const [missingEnv] = useState<string[]>(() => getMissingSupabaseEnv());

  // If Supabase environment variables are missing, render the clear error page
  if (missingEnv.length > 0) {
    return <EnvErrorPage missingVars={missingEnv} />;
  }

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ToastProvider>
              {children}
              <IdleLock />
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};
