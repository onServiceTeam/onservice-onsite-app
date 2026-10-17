import api from './api';
import type { ApiResponse } from './api';
import type { ReviewAggregate } from './review.service';

/**
 * The public Service Provider profile (GET /api/v1/providers/:id). The screen
 * reads only these public fields. It never needs the Service Provider's map
 * location, account status or account id, so they are not part of this type
 * (Service Provider profile privacy fix). Fields a newer or older server may
 * leave out are optional.
 */
export interface Provider {
  id: string;
  /** Shown first on the profile. */
  businessName?: string | null;
  /** The person's name, shown under the business name. */
  name: string | null;
  /** Profile photo; the initials avatar is shown when it is missing. */
  avatarUrl?: string | null;
  tier: 'new' | 'verified' | 'pro' | 'elite' | 'founding';
  bio: string | null;
  rating: number | null;
  totalJobs: number;
  acceptanceRate: number | null;
  responseTimeMinutes: number | null;
  yearsExperience: number | null;
  serviceRadiusKm: number | null;
  city: string | null;
  province: string | null;
  createdAt?: string;
}

export interface ProviderService {
  id: string;
  providerId: string;
  subcategoryId: string;
  subcategoryName: string;
  // Phase 200 — category context so the customer can book this service.
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  description: string;
  pricingType: string | null;
  hourlyRate: number | null;
  unitLabel: string | null;
  unitPrice: number | null;
  basePrice: number | null;
  isActive: boolean;
}

export interface ScheduleSlot {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

export interface PortfolioItem {
  id: string;
  imageUrl: string;
  caption: string | null;
  categoryId: string | null;
  displayOrder: number;
  createdAt: string;
}

export interface Certification {
  id: string;
  name: string;
  issuingBody: string;
  issuedDate: string | null;
  expiryDate: string | null;
  isVerified: boolean;
  verifiedAt: string | null;
  createdAt: string;
}

export interface ProviderProfile extends Provider {
  services: ProviderService[];
  schedule: ScheduleSlot[];
  ratings: ReviewAggregate;
  portfolio: PortfolioItem[];
  certifications: Certification[];
  sukiCount: number;
}

export async function getProviderProfile(id: string): Promise<ProviderProfile> {
  const res = await api.get<ApiResponse<ProviderProfile>>(`/api/v1/providers/${id}`);
  return res.data.data;
}
