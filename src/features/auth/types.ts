import { Database } from '../../types/database';

export type UserRole = Database['public']['Enums']['user_role'];
export type Profile = Database['public']['Tables']['profiles']['Row'];

export interface StaffMember extends Profile {
  email?: string | null;
}

export interface CreateStaffInput {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  phone?: string;
}

export interface SetRoleInput {
  user_id: string;
  new_role: UserRole;
}

export interface AuthContextType {
  user: { id: string; email?: string } | null;
  profile: Profile | null;
  role: UserRole | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isLocked: boolean;
  lockApp: () => void;
  unlockApp: (password: string) => Promise<{ success: boolean; error?: string }>;
  // MFA State & Actions
  aal?: 'aal1' | 'aal2';
  isMfaEnrolled?: boolean;
  needsMfaEnrollment?: boolean;
  needsMfaChallenge?: boolean;
  verifyMfaCode?: (code: string) => Promise<{ success: boolean; error?: string }>;
  enrollTotp?: () => Promise<{ id: string; qrCode: string; secret: string; uri: string }>;
  verifyEnrollment?: (factorId: string, code: string) => Promise<{ success: boolean; error?: string }>;
  refreshMfaState?: () => Promise<void>;
}

