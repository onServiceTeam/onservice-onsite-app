export type UserRole = 'customer' | 'provider' | 'admin' | 'super_admin';

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
