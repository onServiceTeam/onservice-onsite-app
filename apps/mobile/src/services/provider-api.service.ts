import api from './api';
import type { ApiResponse } from './api';
import type { Booking } from './booking.service';

export interface ProviderSelf {
  id: string;
  userId: string;
  businessName: string;
  // Phase K MED-K05 fix — 'founding' tier added to match migration
  // 073 CHECK constraint and the 5-tier ladder in commission /
  // platform_settings (Founding, New, Verified, Pro, Elite).
  tier: 'founding' | 'new' | 'verified' | 'pro' | 'elite';
  status: 'pending' | 'approved' | 'suspended' | 'deactivated' | 'rejected';
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

export interface ProviderServiceItem {
  id: string;
  providerId: string;
  subcategoryId: string;
  subcategoryName: string;
  description?: string;
  pricingType?: 'fixed' | 'hourly' | 'per_unit' | 'range' | 'quote' | string;
  basePrice: number | null;
  hourlyRate?: number | null;
  unitLabel?: string | null;
  unitPrice?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  categoryId?: string | null;
  categoryName?: string | null;
  categorySlug?: string | null;
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

export interface PortfolioItem {
  id: string;
  imageUrl: string;
  caption: string | null;
  categoryId: string | null;
  displayOrder: number;
  customerConsentConfirmed: boolean;
  createdAt: string;
}

export interface Certification {
  id: string;
  name: string;
  issuingBody: string;
  certificateNumber: string | null;
  hasDocument: boolean;
  documentUrl: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  isVerified: boolean;
  verifiedAt: string | null;
  createdAt: string;
}

export interface ProviderDashboard extends ProviderSelf {
  services: ProviderServiceItem[];
  schedule: ScheduleSlot[];
  ratings: ReviewAggregate;
  portfolio: PortfolioItem[];
  certifications: Certification[];
}

export interface ProviderApplicationStatus {
  status: ProviderSelf['status'];
  rejectionReason: string | null;
}

export async function getApplicationStatus(): Promise<ProviderApplicationStatus | null> {
  const res = await api.get<ApiResponse<ProviderApplicationStatus | null>>(
    '/api/v1/providers/application-status',
  );
  return res.data.data;
}

export async function getMyProfile(): Promise<ProviderDashboard> {
  const res = await api.get<ApiResponse<ProviderDashboard>>('/api/v1/providers/me');
  return res.data.data;
}

export async function updateMyProfile(data: {
  bio?: string;
  yearsExperience?: number | null;
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

// --- Portfolio ---

export async function getMyPortfolio(): Promise<PortfolioItem[]> {
  const res = await api.get<ApiResponse<PortfolioItem[]>>('/api/v1/providers/me/portfolio');
  return res.data.data;
}

export async function addPortfolioItem(data: {
  imageUrl: string;
  caption?: string;
  categoryId?: string;
  displayOrder?: number;
  customerConsentConfirmed: true;
}): Promise<PortfolioItem> {
  const res = await api.post<ApiResponse<PortfolioItem>>('/api/v1/providers/me/portfolio', data);
  return res.data.data;
}

export async function updatePortfolioItem(itemId: string, data: {
  caption?: string;
  displayOrder?: number;
}): Promise<PortfolioItem> {
  const res = await api.patch<ApiResponse<PortfolioItem>>(`/api/v1/providers/me/portfolio/${itemId}`, data);
  return res.data.data;
}

export async function removePortfolioItem(itemId: string): Promise<void> {
  await api.delete(`/api/v1/providers/me/portfolio/${itemId}`);
}

// --- Certifications ---

export async function getMyCertifications(): Promise<Certification[]> {
  const res = await api.get<ApiResponse<Certification[]>>('/api/v1/providers/me/certifications');
  return res.data.data;
}

export async function addCertification(data: {
  name: string;
  issuingBody?: string;
  certificateNumber?: string | null;
  certificateUrl?: string | null;
  issuedDate?: string | null;
  expiryDate?: string | null;
}): Promise<Certification> {
  const res = await api.post<ApiResponse<Certification>>('/api/v1/providers/me/certifications', data);
  return res.data.data;
}

export async function updateCertification(certId: string, data: {
  name?: string;
  issuingBody?: string;
  certificateNumber?: string | null;
  certificateUrl?: string | null;
  issuedDate?: string | null;
  expiryDate?: string | null;
}): Promise<Certification> {
  const res = await api.patch<ApiResponse<Certification>>(`/api/v1/providers/me/certifications/${certId}`, data);
  return res.data.data;
}

export async function removeCertification(certId: string): Promise<void> {
  await api.delete(`/api/v1/providers/me/certifications/${certId}`);
}

// --- Availability Overrides (US-P008) ---

export interface AvailabilityOverride {
  id: string;
  overrideDate: string;
  isAvailable: boolean;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  createdAt: string;
}

export async function getAvailabilityOverrides(from?: string, to?: string): Promise<AvailabilityOverride[]> {
  const params: Record<string, string> = {};
  if (from) params.from = from;
  if (to) params.to = to;
  const res = await api.get<ApiResponse<AvailabilityOverride[]>>('/api/v1/providers/me/availability/overrides', { params });
  return res.data.data;
}

export async function addAvailabilityOverride(data: {
  overrideDate: string;
  isAvailable: boolean;
  startTime?: string;
  endTime?: string;
  reason?: string;
}): Promise<AvailabilityOverride> {
  const res = await api.post<ApiResponse<AvailabilityOverride>>('/api/v1/providers/me/availability/overrides', data);
  return res.data.data;
}

export async function removeAvailabilityOverride(overrideId: string): Promise<void> {
  await api.delete(`/api/v1/providers/me/availability/overrides/${overrideId}`);
}

export async function getAvailabilityStatus(): Promise<boolean> {
  const res = await api.get<ApiResponse<{ isAvailable: boolean }>>('/api/v1/providers/me/availability/status');
  return res.data.data.isAvailable;
}

export async function toggleAvailability(isAvailable: boolean): Promise<void> {
  await api.put('/api/v1/providers/me/availability/toggle', { isAvailable });
}

// --- Calendar / Upcoming Jobs (US-P007) ---

export interface CalendarJob {
  id: string;
  status: string;
  scheduledAt: string;
  serviceName: string;
  customerName: string;
  totalAmount: number;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface CalendarData {
  jobs: CalendarJob[];
  overrides: AvailabilityOverride[];
}

export async function getCalendarData(from: string, to: string): Promise<CalendarData> {
  const res = await api.get<ApiResponse<CalendarData>>('/api/v1/providers/me/calendar', { params: { from, to } });
  return res.data.data;
}

// --- Tier Progression (US-P016) ---

export interface TierRequirement {
  tier: string;
  minJobs: number;
  minRating: number;
  requiresCertification: boolean;
  requiresZeroDisputes: boolean;
  commission: number;
  benefits: string[];
}

export interface TierProgressionData {
  currentTier: string;
  currentCommission: number;
  currentCommissionSource: 'tier_default' | 'provider_contract';
  currentCommissionRateVersionId: string;
  progressionTrack: 'founding' | 'standard';
  promotionMode: 'admin_review';
  nextTier: TierRequirement | null;
  progress: {
    totalJobs: number;
    rating: number | null;
    hasCertification: boolean;
    openDisputeCount: number;
  };
  requirements: {
    jobs: { current: number; required: number; met: boolean };
    rating: { current: number | null; required: number; met: boolean };
    certification: { required: boolean; met: boolean };
    disputes: { required: boolean; current: number; met: boolean };
  } | null;
  allTiers: TierRequirement[];
  progressionTiers: TierRequirement[];
}

export async function getTierProgression(): Promise<TierProgressionData> {
  const res = await api.get<ApiResponse<TierProgressionData>>('/api/v1/providers/me/tier-progression');
  return res.data.data;
}

// --- Bookings ---

export async function getProviderBookings(
  status: string,
  page: number,
  pageSize: number,
  filters?: { sort?: 'newest' | 'oldest' | 'highest_pay'; periodDays?: 7 | 30 | 90 },
): Promise<{ bookings: Booking[]; total: number; page: number; pageSize: number }> {
  const res = await api.get<{
    success: boolean;
    data: Booking[];
    meta: { total: number; page: number; pageSize: number };
  }>('/api/v1/bookings', { params: { status, page, pageSize, ...filters } });
  return {
    bookings: res.data.data,
    total: res.data.meta.total,
    page: res.data.meta.page,
    pageSize: res.data.meta.pageSize,
  };
}

export interface StatusUpdateResult {
  booking: Booking;
  warning?: { code: string; message: string };
}

interface StatusUpdateLocation {
  latitude: number;
  longitude: number;
}

export async function updateBookingStatus(
  bookingId: string,
  status: string,
  cancellationReason?: string,
  location?: StatusUpdateLocation,
): Promise<StatusUpdateResult> {
  const body: Record<string, string | number> = { status };
  if (cancellationReason) body.cancellationReason = cancellationReason;
  if (location) {
    body.latitude = location.latitude;
    body.longitude = location.longitude;
  }
  const res = await api.patch<ApiResponse<Booking> & { warning?: { code: string; message: string } }>(
    `/api/v1/bookings/${bookingId}/status`,
    body,
  );
  return { booking: res.data.data, warning: res.data.warning };
}
