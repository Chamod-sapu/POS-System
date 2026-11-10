import { supabase } from '../../../lib/supabase';
import { Profile, StaffMember, CreateStaffInput, SetRoleInput } from '../types';

export interface AuthErrorResult {
  message: string;
}

/**
 * Sign in with email and password (with optional CAPTCHA verification token)
 */
export async function signInWithEmail(email: string, password: string, captchaToken?: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: captchaToken ? { captchaToken } : undefined,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Sign out current session
 */
export async function signOutUser(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Sign out error:', error);
  }
}

/**
 * Fetch staff profile from profiles table
 */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Failed to load profile:', error);
    return null;
  }

  return data;
}

/**
 * Re-authenticates the current user's password to unlock an idle screen
 */
export async function verifyCurrentPassword(email: string, password: string): Promise<boolean> {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  return !error;
}

/**
 * Invoke owner-only admin-manage-staff Edge Function
 */
async function invokeStaffFunction<T>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-manage-staff', {
    body: payload,
  });

  if (error) {
    throw new Error(error.message || 'Edge function invocation failed');
  }

  if (data && typeof data === 'object' && 'error' in data) {
    const errorData = data as { error: string; message?: string };
    throw new Error(errorData.message || errorData.error);
  }

  return data as T;
}

/**
 * List all staff members (with emails) - owner only
 */
export async function listStaff(): Promise<StaffMember[]> {
  try {
    const res = await invokeStaffFunction<{ success: boolean; staff: StaffMember[] }>({
      action: 'list_staff',
    });
    return res.staff || [];
  } catch {
    // Fallback: If edge function is not deployed yet in local dev, query profiles directly (RLS allows owners to select all)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return ((data || []) as Profile[]).map((p: Profile) => ({ ...p, email: null }));
  }
}

/**
 * Create a new staff user - owner only
 */
export async function createStaffMember(input: CreateStaffInput): Promise<StaffMember> {
  const res = await invokeStaffFunction<{ success: boolean; user: StaffMember }>({
    action: 'create_user',
    ...input,
  });
  return res.user;
}

/**
 * Update staff role - owner only
 */
export async function updateStaffRole(input: SetRoleInput): Promise<void> {
  await invokeStaffFunction<{ success: boolean }>({
    action: 'set_role',
    ...input,
  });
}

/**
 * Deactivate a staff account - owner only
 */
export async function deactivateStaffMember(userId: string): Promise<void> {
  await invokeStaffFunction<{ success: boolean }>({
    action: 'deactivate',
    user_id: userId,
  });
}

/**
 * Reactivate a staff account - owner only
 */
export async function reactivateStaffMember(userId: string): Promise<void> {
  await invokeStaffFunction<{ success: boolean }>({
    action: 'reactivate',
    user_id: userId,
  });
}

/**
 * Reset staff password - owner only
 */
export async function resetStaffPassword(userId: string, newPassword: string): Promise<void> {
  await invokeStaffFunction<{ success: boolean }>({
    action: 'reset_password',
    user_id: userId,
    new_password: newPassword,
  });
}

// -----------------------------------------------------------------------------
// MFA (Supabase Auth TOTP) & Security Functions
// -----------------------------------------------------------------------------

/**
 * Get current Authenticator Assurance Level (AAL)
 */
export async function getMfaAal(): Promise<{ currentLevel: 'aal1' | 'aal2'; nextLevel: 'aal1' | 'aal2' }> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) {
      return { currentLevel: 'aal1', nextLevel: 'aal1' };
    }
    return {
      currentLevel: (data.currentLevel as 'aal1' | 'aal2') || 'aal1',
      nextLevel: (data.nextLevel as 'aal1' | 'aal2') || 'aal1',
    };
  } catch {
    return { currentLevel: 'aal1', nextLevel: 'aal1' };
  }
}

/**
 * List enrolled MFA factors
 */
export async function listMfaFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) {
    console.error('Failed to list MFA factors:', error);
    return { all: [], totp: [] };
  }
  return data ?? { all: [], totp: [] };
}

/**
 * Enroll a new TOTP MFA factor
 */
export async function enrollTotpFactor(): Promise<{ id: string; qrCode: string; secret: string; uri: string }> {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    issuer: 'Wewala Super Store',
  });

  if (error || !data) {
    throw new Error(error?.message || 'Failed to initiate TOTP MFA enrollment');
  }

  return {
    id: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

/**
 * Challenge and verify a TOTP 6-digit code to elevate session to AAL2
 */
export async function verifyMfaChallenge(factorId: string, code: string): Promise<boolean> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: code.trim(),
  });

  if (error) {
    throw new Error(error.message || 'Invalid MFA code');
  }

  return true;
}

/**
 * Change own password and terminate all other active sessions globally
 */
export async function changePasswordAndSignOutOthers(password: string): Promise<void> {
  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    throw new Error(updateError.message);
  }

  // Invalidate all other sessions for this account
  try {
    await supabase.auth.signOut({ scope: 'others' });
  } catch (err) {
    console.warn('Sign out other sessions error:', err);
  }
}
