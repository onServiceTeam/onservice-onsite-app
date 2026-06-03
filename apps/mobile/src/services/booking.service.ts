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
  sukiDiscount: number;
  /**
   * Phase K CRIT-K05 audit context — these legacy TEXT[] array fields
   * (jobPhotos, providerBeforePhotos, providerAfterPhotos) date from
   * migration 037 and were superseded by the booking_photos table in
   * migration 079. New uploads MUST go through booking-photo.service
   * (uploadBookingPhoto → /api/v1/uploads/booking-photo). The arrays
   * are kept here only because legacy bookings may still have data
   * in them; the canonical photo source is /api/v1/bookings/:id/photos
   * which UNIONS both for read.
   *
   * @deprecated Use booking-photo.service.uploadBookingPhoto for writes.
   */
  jobPhotos: string[];
  /** @deprecated See note on jobPhotos. */
  providerBeforePhotos: string[];
  /** @deprecated See note on jobPhotos. */
  providerAfterPhotos: string[];
  createdAt: string;
  providerName?: string;
  serviceName?: string;
  categoryName?: string;
  // BUG-PHASE77-01 — server now returns customerName from a JOIN on
  // users by customer_id. Provider-side screens (navigate, dashboard,
  // calendar) display this as the destination/contact name. Customer-
  // side screens never need it but receiving it is harmless.
  customerName?: string;
  // D23 — the team member assigned to perform this job (null = the provider
  // owner does it themselves).
  performerStaffId?: string | null;
}

// Phase 14 Dispatch 05 — Bug 175 + Bug 176.
// `servicePrice` removed; server resolves canonical price from
// service_subcategories.base_price. Addons changed to `{addonId, quantity}`;
// server resolves price from service_addons by id.
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
  // Phase 14 Dispatch 05 — Bug 261. Customer sends only the code; server
  // resolves the canonical discount via promo.service.
  promoCode?: string;
  addons?: Array<{ addonId: string; quantity: number }>;
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
): Promise<unknown> {
  const res = await api.post<ApiResponse<unknown>>(`/api/v1/bookings/${bookingId}/quotes`, data);
  return res.data.data;
}

export async function acceptQuote(bookingId: string, quoteId: string): Promise<{ quoteId: string; providerId: string; totalAmount: number }> {
  const res = await api.post<ApiResponse<{ quoteId: string; providerId: string; totalAmount: number }>>(`/api/v1/bookings/${bookingId}/quotes/${quoteId}/accept`);
  return res.data.data;
}

export async function declineQuote(bookingId: string, quoteId: string): Promise<{ quoteId: string }> {
  const res = await api.post<ApiResponse<{ quoteId: string }>>(`/api/v1/bookings/${bookingId}/quotes/${quoteId}/decline`);
  return res.data.data;
}

// Phase 200 — provider responds to an auto-dispatch offer (the 45s "New Job"
// offer). Accepting sets the booking's provider_id and advances it to
// 'matched'; declining lets the cascade move to the next provider.
export async function acceptOffer(offerId: string): Promise<{ booking_id: string; provider_id: string }> {
  const res = await api.post<ApiResponse<{ booking_id: string; provider_id: string }>>(`/api/v1/bookings/offers/${offerId}/accept`);
  return res.data.data;
}

export async function declineOffer(offerId: string, reason = 'Not available'): Promise<{ booking_id: string }> {
  const res = await api.post<ApiResponse<{ booking_id: string }>>(`/api/v1/bookings/offers/${offerId}/decline`, { reason });
  return res.data.data;
}

export interface ChangeOrder {
  id: string;
  bookingId: string;
  providerId: string;
  description: string;
  additionalAmount: number;
  // Phase 200 — the list endpoint now returns the marginal service fee +
  // total so the re-pay screen can show the real total and gate on wallet
  // balance. Null only if the parent booking could not be read.
  additionalServiceFee: number | null;
  additionalTotal: number | null;
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

export interface ChangeOrderResponse {
  id: string;
  status: string;
  bookingId?: string;
  paymentRequired?: boolean;
  additionalAmount?: number;
  additionalServiceFee?: number;
  additionalTotal?: number;
}

export async function respondToChangeOrder(changeOrderId: string, approved: boolean): Promise<ChangeOrderResponse> {
  const res = await api.post<ApiResponse<ChangeOrderResponse>>(`/api/v1/bookings/change-orders/${changeOrderId}/respond`, { approved });
  return res.data.data;
}

export async function payChangeOrder(changeOrderId: string, paymentMethod: string): Promise<{
  changeOrderId: string;
  bookingId: string;
  additionalAmountPaid: number;
  paymentMethod: string;
  message: string;
}> {
  const res = await api.post<ApiResponse<{
    changeOrderId: string;
    bookingId: string;
    additionalAmountPaid: number;
    paymentMethod: string;
    message: string;
  }>>(`/api/v1/bookings/change-orders/${changeOrderId}/pay`, { paymentMethod });
  return res.data.data;
}

/**
 * Phase K CRIT-K05 — uploadJobPhotos still posts to the legacy
 * /bookings/:id/photos endpoint that writes the TEXT[] arrays. New
 * code MUST call booking-photo.service.uploadBookingPhoto instead,
 * which writes to the canonical booking_photos table (migration
 * 079). This function remains for back-compat with the few flows
 * that haven't migrated; new screens should not use it.
 *
 * @deprecated Prefer @/services/booking-photo.service.uploadBookingPhoto.
 */
export async function uploadJobPhotos(
  bookingId: string,
  phase: 'before' | 'after',
  urls: string[],
): Promise<Booking> {
  const res = await api.post<ApiResponse<Booking>>(`/api/v1/bookings/${bookingId}/photos`, {
    phase,
    urls,
  });
  return res.data.data;
}

export interface DisputeEvidence {
  url: string;
  type: 'photo' | 'video' | 'document';
  description?: string;
}

export async function fileDispute(data: {
  bookingId: string;
  type: string;
  description: string;
  evidenceUrls?: DisputeEvidence[];
}): Promise<unknown> {
  const res = await api.post<ApiResponse<unknown>>('/api/v1/disputes', data);
  return res.data.data;
}
