import api from './api';
import type { ApiResponse, PaginatedResponse } from './api';

export interface RecurringBooking {
  id: string;
  customerId: string;
  providerId: string | null;
  categoryId: string;
  subcategoryId: string | null;
  originalBookingId: string | null;
  frequency: 'weekly' | 'bi_weekly' | 'monthly';
  preferredDay: number;
  preferredDayName: string;
  preferredTime: string;
  address: string;
  barangay: string;
  city: string;
  province: string;
  latitude: number | null;
  longitude: number | null;
  servicePrice: number;
  serviceFee: number;
  totalAmount: number;
  status: 'active' | 'paused' | 'cancelled';
  nextBookingDate: string;
  lastBookingDate: string | null;
  skipDates: string[];
  autoCharge: boolean;
  allowSubstitute: boolean;
  totalInstances: number;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringInstance {
  id: string;
  recurringBookingId: string;
  bookingId: string | null;
  scheduledDate: string;
  status: 'pending' | 'created' | 'skipped' | 'failed' | 'substituted' | 'completed' | 'cancelled';
  bookingStatus: string | null;
  substituteProviderId: string | null;
  failureReason: string | null;
  createdAt: string;
}

export interface CreateRecurringParams {
  providerId?: string;
  categoryId: string;
  subcategoryId: string;
  originalBookingId?: string;
  frequency: 'weekly' | 'bi_weekly' | 'monthly';
  preferredDay: number;
  preferredTime: string;
  address: string;
  barangay: string;
  city: string;
  province: string;
  latitude?: number;
  longitude?: number;
}

export async function createRecurringBooking(
  params: CreateRecurringParams,
): Promise<RecurringBooking> {
  const res = await api.post<ApiResponse<RecurringBooking>>('/api/v1/recurring', params);
  return res.data.data;
}

export async function getRecurringBookings(
  page = 1,
  pageSize = 20,
): Promise<{ items: RecurringBooking[]; total: number }> {
  const res = await api.get<PaginatedResponse<RecurringBooking>>('/api/v1/recurring', {
    params: { page, pageSize },
  });
  return { items: res.data.data, total: res.data.pagination.total };
}

export async function getRecurringBooking(id: string): Promise<RecurringBooking> {
  const res = await api.get<ApiResponse<RecurringBooking>>(`/api/v1/recurring/${id}`);
  return res.data.data;
}

export async function getRecurringInstances(
  id: string,
  page = 1,
  pageSize = 20,
): Promise<{ items: RecurringInstance[]; total: number }> {
  const res = await api.get<PaginatedResponse<RecurringInstance>>(
    `/api/v1/recurring/${id}/instances`,
    { params: { page, pageSize } },
  );
  return { items: res.data.data, total: res.data.pagination.total };
}

export async function pauseRecurringBooking(id: string): Promise<RecurringBooking> {
  const res = await api.post<ApiResponse<RecurringBooking>>(`/api/v1/recurring/${id}/pause`);
  return res.data.data;
}

export async function resumeRecurringBooking(id: string): Promise<RecurringBooking> {
  const res = await api.post<ApiResponse<RecurringBooking>>(`/api/v1/recurring/${id}/resume`);
  return res.data.data;
}

export async function cancelRecurringBooking(
  id: string,
  reason?: string,
): Promise<RecurringBooking> {
  const res = await api.post<ApiResponse<RecurringBooking>>(
    `/api/v1/recurring/${id}/cancel`,
    { reason },
  );
  return res.data.data;
}

export async function skipNextInstance(
  id: string,
  skipDate: string,
): Promise<RecurringBooking> {
  const res = await api.post<ApiResponse<RecurringBooking>>(
    `/api/v1/recurring/${id}/skip`,
    { skipDate },
  );
  return res.data.data;
}
