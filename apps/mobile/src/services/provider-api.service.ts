import api from './api';
import type { ApiResponse } from './api';
import type { Booking } from './booking.service';

export interface ProviderSelf {
  id: string;
  userId: string;
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

export interface ProviderServiceItem {
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

export interface ReviewAggregate {
  overall: number | null;
  totalReviews: number;
  quality: number | null;
  punctuality: number | null;
  professionalism: number | null;
  communication: number | null;
  value: number | null;
}

export interface ProviderDashboard extends ProviderSelf {
  services: ProviderServiceItem[];
  schedule: ScheduleSlot[];
  ratings: ReviewAggregate;
}

export async function getMyProfile(): Promise<ProviderDashboard> {
  const res = await api.get<ApiResponse<ProviderDashboard>>('/api/v1/providers/me');
  return res.data.data;
}

export async function updateMyProfile(data: {
  bio?: string;
  yearsExperience?: number;
  serviceRadiusKm?: number;
}): Promise<ProviderSelf> {
  const res = await api.patch<ApiResponse<ProviderSelf>>('/api/v1/providers/me', data);
  return res.data.data;
}

export async function setAvailability(isAvailable: boolean): Promise<ProviderSelf> {
  const res = await api.post<ApiResponse<ProviderSelf>>('/api/v1/providers/me/availability', { isAvailable });
  return res.data.data;
}

export async function getMyServices(): Promise<ProviderServiceItem[]> {
  const res = await api.get<ApiResponse<ProviderServiceItem[]>>('/api/v1/providers/me/services');
  return res.data.data;
}

export async function addService(subcategoryId: string, basePrice?: number): Promise<ProviderServiceItem> {
  const body: Record<string, unknown> = { subcategoryId };
  if (basePrice && basePrice > 0) body.basePrice = basePrice;
  const res = await api.post<ApiResponse<ProviderServiceItem>>('/api/v1/providers/me/services', body);
  return res.data.data;
}

export async function removeService(subcategoryId: string): Promise<void> {
  await api.delete(`/api/v1/providers/me/services/${subcategoryId}`);
}

export async function getMySchedule(): Promise<ScheduleSlot[]> {
  const res = await api.get<ApiResponse<ScheduleSlot[]>>('/api/v1/providers/me/schedule');
  return res.data.data;
}

export async function setMySchedule(
  schedule: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
  }>,
): Promise<ScheduleSlot[]> {
  const res = await api.put<ApiResponse<ScheduleSlot[]>>('/api/v1/providers/me/schedule', { schedule });
  return res.data.data;
}

export async function getProviderBookings(
  status: string,
  page: number,
  pageSize: number,
): Promise<{ bookings: Booking[]; total: number; page: number; pageSize: number }> {
  const res = await api.get<{
    success: boolean;
    data: Booking[];
    meta: { total: number; page: number; pageSize: number };
  }>('/api/v1/bookings', { params: { status, page, pageSize } });
  return {
    bookings: res.data.data,
    total: res.data.meta.total,
    page: res.data.meta.page,
    pageSize: res.data.meta.pageSize,
  };
}

export async function updateBookingStatus(
  bookingId: string,
  status: string,
  cancellationReason?: string,
): Promise<Booking> {
  const body: Record<string, string> = { status };
  if (cancellationReason) body.cancellationReason = cancellationReason;
  const res = await api.patch<ApiResponse<Booking>>(`/api/v1/bookings/${bookingId}/status`, body);
  return res.data.data;
}
