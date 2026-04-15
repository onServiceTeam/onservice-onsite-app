import api from './api';
import type { ApiResponse } from './api';

export interface Booking {
  id: string;
  customerId: string;
  providerId: string | null;
  categoryId: string;
  subcategoryId: string | null;
  bookingType: string;
  status: string;
  escrowStatus: string;
  servicePrice: number;
  serviceFee: number;
  totalAmount: number;
  description: string;
  address: string;
  barangay: string;
  city: string;
  province: string;
  latitude: number | null;
  longitude: number | null;
  scheduledAt: string;
  completedAt: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  paymentMethod: string | null;
  surgeMultiplier: number;
  surgeAmount: number;
  rebookedFromId: string | null;
  createdAt: string;
  providerName?: string;
  serviceName?: string;
  categoryName?: string;
}

export interface CreateBookingPayload {
  categoryId: string;
  subcategoryId: string;
  bookingType: 'fixed_price';
  description: string;
  address: string;
  barangay: string;
  city: string;
  province: string;
  latitude?: number;
  longitude?: number;
  scheduledAt: string;
  rebookedFromId?: string;
  waitlistId?: string;
}

export async function createBooking(data: CreateBookingPayload): Promise<Booking> {
  const res = await api.post<ApiResponse<Booking>>('/api/v1/bookings', data);
  return res.data.data;
}

export async function getActiveBookings(): Promise<Booking[]> {
  const res = await api.get<ApiResponse<Booking[]>>('/api/v1/bookings', {
    params: { status: 'active', page: 1, pageSize: 5 },
  });
  return res.data.data;
}

export async function getRecentBookings(limit = 3): Promise<Booking[]> {
  const res = await api.get<ApiResponse<Booking[]>>('/api/v1/bookings', {
    params: { status: 'completed', page: 1, pageSize: limit },
  });
  return res.data.data;
}

export async function getBookingById(id: string): Promise<Booking> {
  const res = await api.get<ApiResponse<Booking>>(`/api/v1/bookings/${id}`);
  return res.data.data;
}

export interface JobRequestPayload {
  categoryId: string;
  subcategoryId?: string;
  description: string;
  address: string;
  barangay: string;
  city: string;
  province: string;
  latitude?: number;
  longitude?: number;
  urgency: 'same_day' | 'within_3_days' | 'within_a_week' | 'flexible';
  budgetMin?: number;
  budgetMax?: number;
  jobPhotos?: string[];
  jobVideoUrl?: string;
}

export async function createJobRequest(data: JobRequestPayload): Promise<Booking> {
  const res = await api.post<ApiResponse<Booking>>('/api/v1/bookings/job-request', data);
  return res.data.data;
}

export interface QuoteLineItem {
  id?: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  itemType: string;
}

export interface BookingQuote {
  id: string;
  bookingId: string;
  providerId: string;
  quotedPrice: number;
  description: string;
  estimatedDurationMinutes: number | null;
  status: string;
  laborAmount: number;
  materialsAmount: number;
  estimatedDays: number | null;
  notes: string;
  portfolioPhotos: string[];
  expiresAt: string;
  createdAt: string;
  providerName: string | null;
  providerRating: number | null;
  providerTotalJobs: number;
  lineItems: QuoteLineItem[];
}

export async function getBookingQuotes(bookingId: string): Promise<BookingQuote[]> {
  const res = await api.get<ApiResponse<BookingQuote[]>>(`/api/v1/bookings/${bookingId}/quotes`);
  return res.data.data;
}

export async function submitQuote(
  bookingId: string,
  data: {
    quotedPrice: number;
    description: string;
    estimatedDurationMinutes?: number;
    estimatedDays?: number;
    notes?: string;
    portfolioPhotos?: string[];
    lineItems?: Omit<QuoteLineItem, 'id' | 'lineTotal'>[];
  },
) {
  const res = await api.post<ApiResponse<unknown>>(`/api/v1/bookings/${bookingId}/quotes`, data);
  return res.data.data;
}

export async function acceptQuote(bookingId: string, quoteId: string) {
  const res = await api.post<ApiResponse<{ quoteId: string; providerId: string; totalAmount: number }>>(`/api/v1/bookings/${bookingId}/quotes/${quoteId}/accept`);
  return res.data.data;
}

export async function declineQuote(bookingId: string, quoteId: string) {
  const res = await api.post<ApiResponse<{ quoteId: string }>>(`/api/v1/bookings/${bookingId}/quotes/${quoteId}/decline`);
  return res.data.data;
}

export interface ChangeOrder {
  id: string;
  bookingId: string;
  providerId: string;
  description: string;
  additionalAmount: number;
  photos: string[];
  status: string;
  customerRespondedAt: string | null;
  createdAt: string;
}

export async function createChangeOrder(
  bookingId: string,
  data: { description: string; additionalAmount: number; photos?: string[] },
): Promise<ChangeOrder> {
  const res = await api.post<ApiResponse<ChangeOrder>>(`/api/v1/bookings/${bookingId}/change-orders`, data);
  return res.data.data;
}

export async function getChangeOrders(bookingId: string): Promise<ChangeOrder[]> {
  const res = await api.get<ApiResponse<ChangeOrder[]>>(`/api/v1/bookings/${bookingId}/change-orders`);
  return res.data.data;
}

export async function respondToChangeOrder(changeOrderId: string, approved: boolean) {
  const res = await api.post<ApiResponse<{ id: string; status: string }>>(`/api/v1/bookings/change-orders/${changeOrderId}/respond`, { approved });
  return res.data.data;
}

export async function fileDispute(data: {
  bookingId: string;
  type: string;
  description: string;
  evidenceUrls?: string[];
}) {
  const res = await api.post<ApiResponse<unknown>>('/api/v1/disputes', data);
  return res.data.data;
}
