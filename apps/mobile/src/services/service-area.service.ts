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

export interface ProviderServiceAreaChange {
  id: string;
  providerId: string;
  currentAreaId: string | null;
  requestedAreaId: string;
  currentRadiusKm: number | null;
  requestedRadiusKm: number;
  requestedLatitude: number | null;
  requestedLongitude: number | null;
  requestedCity: string | null;
  requestedProvince: string | null;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  decisionReason: string | null;
  requestedAreaName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderServiceAreaState {
  currentArea: {
    id: string;
    name: string;
    city: string;
    province: string;
    centerLat: number;
    centerLng: number;
  } | null;
  currentRadiusKm: number;
  currentLatitude: number | null;
  currentLongitude: number | null;
  maxRadiusKm: number;
  latestChange: ProviderServiceAreaChange | null;
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

export async function getProviderServiceAreaState(): Promise<ProviderServiceAreaState> {
  const res = await api.get<ApiResponse<ProviderServiceAreaState>>('/api/v1/providers/me/service-area');
  return res.data.data;
}

export async function requestProviderServiceAreaChange(input: {
  areaId: string;
  radiusKm: number;
  latitude: number;
  longitude: number;
  reason: string;
}): Promise<ProviderServiceAreaChange> {
  const res = await api.post<ApiResponse<ProviderServiceAreaChange>>(
    '/api/v1/providers/me/service-area/change',
    input,
  );
  return res.data.data;
}

export async function cancelProviderServiceAreaChange(): Promise<ProviderServiceAreaChange> {
  const res = await api.post<ApiResponse<ProviderServiceAreaChange>>(
    '/api/v1/providers/me/service-area/change/cancel',
  );
  return res.data.data;
}
