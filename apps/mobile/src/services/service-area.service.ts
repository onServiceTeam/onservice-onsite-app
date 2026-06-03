import api from './api';
import type { ApiResponse } from './api';

export interface ServiceArea {
  id: string;
  name: string;
  slug: string;
  city: string;
  province: string;
  region: string;
  zipCodes: string[];
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  status: 'planned' | 'recruiting' | 'soft_launch' | 'active' | 'paused' | 'retired';
  launchDate: string | null;
  launchedAt: string | null;
  minProvidersToLaunch: number;
  activeProviderCount: number;
  activeCustomerCount: number;
  totalBookings: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CoverageResult {
  covered: boolean;
  area: ServiceArea | null;
  nearestArea: (ServiceArea & { distanceKm: number | null }) | null;
}

export interface WaitlistEntry {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  city: string;
  province: string;
  barangay: string | null;
  latitude: number | null;
  longitude: number | null;
  serviceAreaId: string | null;
  notified: boolean;
  notifiedAt: string | null;
  createdAt: string;
}

export interface ProviderAreaAssignment {
  id: string;
  providerId: string;
  serviceAreaId: string;
  isPrimary: boolean;
  areaName: string;
  areaCity: string;
  areaStatus: string;
  createdAt: string;
}

export async function getActiveServiceAreas(): Promise<ServiceArea[]> {
  const res = await api.get<ApiResponse<ServiceArea[]>>('/api/v1/service-areas');
  return res.data.data;
}

export async function checkCoverage(
  lat: number,
  lng: number,
): Promise<CoverageResult> {
  const res = await api.get<ApiResponse<CoverageResult>>('/api/v1/service-areas/check', {
    params: { lat, lng },
  });
  return res.data.data;
}

export async function getServiceAreaBySlug(slug: string): Promise<ServiceArea> {
  const res = await api.get<ApiResponse<ServiceArea>>(`/api/v1/service-areas/${slug}`);
  return res.data.data;
}

export async function joinWaitlist(params: {
  fullName: string;
  phone: string;
  email?: string;
  city: string;
  province: string;
  barangay?: string;
  latitude?: number;
  longitude?: number;
}): Promise<WaitlistEntry> {
  const res = await api.post<ApiResponse<WaitlistEntry>>('/api/v1/service-areas/waitlist', params);
  return res.data.data;
}

export async function getMyProviderAreas(): Promise<ProviderAreaAssignment[]> {
  const res = await api.get<ApiResponse<ProviderAreaAssignment[]>>('/api/v1/service-areas/provider/my-areas');
  return res.data.data;
}

export async function joinServiceArea(
  serviceAreaId: string,
  isPrimary?: boolean,
): Promise<{ id: string; providerId: string; serviceAreaId: string; isPrimary: boolean }> {
  const res = await api.post<ApiResponse<{ id: string; providerId: string; serviceAreaId: string; isPrimary: boolean }>>(
    '/api/v1/service-areas/provider/areas',
    { serviceAreaId, isPrimary },
  );
  return res.data.data;
}
