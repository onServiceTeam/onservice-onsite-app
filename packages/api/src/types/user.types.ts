export type UserRole = 'customer' | 'provider' | 'admin' | 'super_admin' | 'dpo' | 'provider_staff';

/**
 * E01 / D15 (2026-05-02) — admin-tier roles.
 * `dpo` (Data Protection Officer) is a real role under NPC RA 10173 §21.
 * It must remain segregated from super_admin so the DPO can't override
 * their own duties. `requireDpoRole` middleware grants either super_admin
 * or dpo access (super_admin retains DPO power as a fallback if the DPO
 * seat is vacant); endpoints that require dpo-only segregation should
 * additionally check that role !== 'super_admin' inline.
 */
export const ADMIN_TIER_ROLES: ReadonlySet<UserRole> = new Set(['admin', 'super_admin', 'dpo']);
export const DPO_AUTHORIZED_ROLES: ReadonlySet<UserRole> = new Set(['super_admin', 'dpo']);

export type ProviderTier = 'new' | 'verified' | 'pro' | 'elite';

export type ProviderStatus = 'pending' | 'approved' | 'suspended' | 'deactivated';

export interface User {
  id: string;
  phone: string;            // +63 9XX XXX XXXX format
  email: string | null;
  firstName: string;
  lastName: string;
  role: UserRole;
  avatarUrl: string | null;
  isVerified: boolean;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Provider {
  id: string;
  userId: string;
  businessName: string;
  description: string;
  tier: ProviderTier;
  status: ProviderStatus;
  nbiClearanceUrl: string | null;
  nbiExpiryDate: Date | null;
  nbiExpiryNotified: boolean;
  serviceRadiusKm: number;
  averageRating: number;
  totalReviews: number;
  totalJobsCompleted: number;
  latitude: number | null;
  longitude: number | null;
  city: string;
  province: string;
  createdAt: Date;
  updatedAt: Date;
}
