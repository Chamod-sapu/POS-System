import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabase';
import { Profile, UserRole, AuthContextType } from '../types';
import {
  fetchProfile,
  signOutUser,
  verifyCurrentPassword,
  getMfaAal,
  listMfaFactors,
  enrollTotpFactor,
  verifyMfaChallenge,
} from '../api/auth';

const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
  idleTimeoutMs?: number;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  idleTimeoutMs = IDLE_TIMEOUT_MS,
}) => {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLocked, setIsLocked] = useState<boolean>(false);

  // MFA State
  const [aal, setAal] = useState<'aal1' | 'aal2'>('aal1');
  const [factors, setFactors] = useState<{ id: string; status: string }[]>([]);
  const [isMfaEnrolled, setIsMfaEnrolled] = useState<boolean>(false);
  const [needsMfaEnrollment, setNeedsMfaEnrollment] = useState<boolean>(false);
  const [needsMfaChallenge, setNeedsMfaChallenge] = useState<boolean>(false);

  const lastActivityRef = useRef<number>(Date.now());
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lockApp = useCallback(() => {
    if (user) {
      setIsLocked(true);
    }
  }, [user]);

  const unlockApp = useCallback(
    async (password: string): Promise<{ success: boolean; error?: string }> => {
      if (!user?.email) {
        return { success: false, error: 'No active user session to unlock.' };
      }

      const isValid = await verifyCurrentPassword(user.email, password);
      if (!isValid) {
        return { success: false, error: 'Incorrect password. Please try again.' };
      }

      setIsLocked(false);
      lastActivityRef.current = Date.now();
      return { success: true };
    },
    [user]
  );

  const loadUserProfile = useCallback(async (userId: string) => {
    const p = await fetchProfile(userId);
    if (!p) {
      setProfile(null);
      return null;
    }

    if (!p.is_active) {
      await signOutUser();
      setUser(null);
      setProfile(null);
      setIsLocked(false);
      alert('Your account has been deactivated. Please contact the store owner.');
      return null;
    }

    setProfile(p);
    return p;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      const p = await loadUserProfile(user.id);
      if (p) {
        await refreshMfaState(p.role as UserRole);
      }
    }
  }, [user?.id, loadUserProfile]);

  const refreshMfaState = useCallback(async (currentRole?: UserRole) => {
    try {
      const aalData = await getMfaAal();
      setAal(aalData.currentLevel);

      const factorList = await listMfaFactors();
      const verifiedTotp = (factorList.totp || []).filter((f: { status?: string }) => f.status === 'verified');
      setFactors(verifiedTotp as { id: string; status: string }[]);
      const hasEnrolled = verifiedTotp.length > 0;
      setIsMfaEnrolled(hasEnrolled);

      const roleToCheck = currentRole || profile?.role;
      if (roleToCheck === 'owner') {
        if (!hasEnrolled) {
          setNeedsMfaEnrollment(true);
          setNeedsMfaChallenge(false);
        } else if (aalData.currentLevel === 'aal1') {
          setNeedsMfaEnrollment(false);
          setNeedsMfaChallenge(true);
        } else {
          setNeedsMfaEnrollment(false);
          setNeedsMfaChallenge(false);
        }
      } else if (roleToCheck === 'manager') {
        if (hasEnrolled && aalData.currentLevel === 'aal1') {
          setNeedsMfaChallenge(true);
        } else {
          setNeedsMfaChallenge(false);
        }
      } else {
        setNeedsMfaEnrollment(false);
        setNeedsMfaChallenge(false);
      }
    } catch (err) {
      console.warn('Failed to refresh MFA state:', err);
    }
  }, [profile?.role]);

  const verifyMfaCode = useCallback(async (code: string): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!factors.length || !factors[0]) {
        return { success: false, error: 'No enrolled MFA factor found.' };
      }
      const primaryFactor = factors[0];
      await verifyMfaChallenge(primaryFactor.id, code);
      setAal('aal2');
      setNeedsMfaChallenge(false);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Invalid MFA code' };
    }
  }, [factors]);

  const enrollTotp = useCallback(async () => {
    return await enrollTotpFactor();
  }, []);

  const verifyEnrollment = useCallback(async (factorId: string, code: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await verifyMfaChallenge(factorId, code);
      setAal('aal2');
      setNeedsMfaEnrollment(false);
      setIsMfaEnrolled(true);
      await refreshMfaState();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Invalid code' };
    }
  }, [refreshMfaState]);

  const signOut = useCallback(async () => {
    setIsLocked(false);
    setUser(null);
    setProfile(null);
    setAal('aal1');
    setIsMfaEnrolled(false);
    setNeedsMfaEnrollment(false);
    setNeedsMfaChallenge(false);
    await signOutUser();
  }, []);

  // 1. Initial auth state setup
  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (session?.user) {
          setUser({ id: session.user.id, email: session.user.email });
          const p = await loadUserProfile(session.user.id);
          if (p) {
            await refreshMfaState(p.role as UserRole);
          }
        } else {
          setUser(null);
          setProfile(null);
        }
      } catch (err) {
        console.error('Error initializing auth:', err);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    initializeAuth();

    // 2. Listen to Supabase auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT' || !session) {
        setUser(null);
        setProfile(null);
        setIsLocked(false);
        setIsLoading(false);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (session.user) {
          setUser({ id: session.user.id, email: session.user.email });
          const p = await loadUserProfile(session.user.id);
          if (p) {
            await refreshMfaState(p.role as UserRole);
          }
        }
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadUserProfile, refreshMfaState]);

  // 3. Real-time subscription to the current user's profile to instantly detect deactivation
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`profile-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        async (payload: { new: Record<string, unknown> }) => {
          const updated = payload.new as unknown as Profile;
          if (updated) {
            if (!updated.is_active) {
              await signOut();
              alert('Your account has been deactivated. Please contact the store owner.');
            } else {
              setProfile(updated);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, signOut]);

  // 4. Inactivity listener for POS idle lock (10 minutes)
  useEffect(() => {
    if (!user || isLocked) {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      return;
    }

    const resetIdleTimer = () => {
      lastActivityRef.current = Date.now();
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      idleTimerRef.current = setTimeout(() => {
        setIsLocked(true);
      }, idleTimeoutMs);
    };

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach((ev) => window.addEventListener(ev, resetIdleTimer, { passive: true }));

    resetIdleTimer();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      activityEvents.forEach((ev) => window.removeEventListener(ev, resetIdleTimer));
    };
  }, [user, isLocked, idleTimeoutMs]);

  const value: AuthContextType = {
    user,
    profile,
    role: (profile?.role as UserRole) || null,
    isLoading,
    signOut,
    refreshProfile,
    isLocked,
    lockApp,
    unlockApp,
    aal,
    isMfaEnrolled,
    needsMfaEnrollment,
    needsMfaChallenge,
    verifyMfaCode,
    enrollTotp,
    verifyEnrollment,
    refreshMfaState,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
