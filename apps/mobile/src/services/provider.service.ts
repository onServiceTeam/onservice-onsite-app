import api from './api';
import type { ApiResponse } from './api';
import type { ReviewAggregate } from './review.service';

export interface Provider {
  id: string;
  userId: string;
  name: string | null;
  tier: 'new' | 'verified' | 'pro' | 'elite' | 'founding';
  bio: string | null;
  rating: number | null;
  totalJobs: number;
  acceptanceRate: number | null;
  responseTimeMinutes: number | null;
  yearsExperience: number | null;
  serviceRadiusKm: number | null;
  isAvailable: boolean;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  province: string | null;
  createdAt: string;
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
  certificateNumber: string | null;
  certificateUrl: string | null;
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
