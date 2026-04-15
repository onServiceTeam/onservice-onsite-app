import api from './api';
import type { ApiResponse } from './api';
import type { ReviewAggregate } from './review.service';

export interface Provider {
  id: string;
  userId: string;
  name: string | null;
  tier: 'new' | 'verified' | 'pro' | 'elite';
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
  createdAt: string;
}

export interface ProviderService {
  id: string;
  providerId: string;
  subcategoryId: string;
  subcategoryName: string;
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

export interface ProviderProfile extends Provider {
  services: ProviderService[];
  schedule: ScheduleSlot[];
  ratings: ReviewAggregate;
}

export async function getProviderProfile(id: string): Promise<ProviderProfile> {
  const res = await api.get<ApiResponse<ProviderProfile>>(`/api/v1/providers/${id}`);
  return res.data.data;
}
