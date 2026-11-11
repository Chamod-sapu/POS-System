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
 * Invoke owner-only admin-manage-staff Edge Function for privileged auth admin actions (create_user, reset_password)
 */
async function invokeStaffFunction<T>(payload: Record<string, unknown>): Promise<T> {
  try {
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
  } catch (err: unknown) {
    const errMsg = (err instanceof Error ? err.message : String(err)) || '';
    if (
      errMsg.includes('Failed to send a request') ||
      errMsg.includes('404') ||
      errMsg.includes('FunctionsFetchError') ||
      errMsg.includes('CORS') ||
      errMsg.includes('ERR_FAILED')
    ) {
      throw new Error(
        "The 'admin-manage-staff' Edge Function is not deployed to your Supabase project. Deploy it using: npx supabase functions deploy admin-manage-staff"
      );
    }
    throw err;
  }
}

/**
 * List all staff members - owner only.
 * Reads directly from profiles table with PostgreSQL RLS enforcement (no Edge Function required).
 */
export async function listStaff(): Promise<StaffMember[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to list staff:', error);
    throw new Error(error.message);
  }

  // Get current user session to enrich own email if available
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return ((data || []) as Profile[]).map((p: Profile) => ({
    ...p,
    email: user && user.id === p.id ? user.email || null : null,
  }));
}

/**
 * Create a new staff user - owner only.
 * Requires the admin-manage-staff Edge Function with elevated privileges.
 */
export async function createStaffMember(input: CreateStaffInput): Promise<StaffMember> {
  const res = await invokeStaffFunction<{ success: boolean; user: StaffMember }>({
    action: 'create_user',
    ...input,
  });
  return res.user;
}

/**
 * Update staff role - owner only.
 * Directly updates profiles table with PostgreSQL RLS enforcement.
 */
export async function updateStaffRole(input: SetRoleInput): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ role: input.new_role })
    .eq('id', input.user_id);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Deactivate a staff account - owner only.
 * Directly updates profiles table with PostgreSQL RLS enforcement.
 */
export async function deactivateStaffMember(userId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && user.id === userId) {
    throw new Error('You cannot deactivate your own account.');
  }

  const { error } = await supabase
    .from('profiles')
    .update({ is_active: false })
    .eq('id', userId);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Reactivate a staff account - owner only.
 * Directly updates profiles table with PostgreSQL RLS enforcement.
 */
export async function reactivateStaffMember(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: true })
    .eq('id', userId);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Reset staff password - owner only.
 * Requires the admin-manage-staff Edge Function with elevated privileges.
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
