import api from './api';
import type { ApiResponse } from './api';

export interface PricingResult {
  basePrice: number;
  surgeMultiplier: number;
  surgeAmount: number;
  finalPrice: number;
  appliedRule: { id: string; name: string; type: string; multiplier: number } | null;
  platformSurgeShare: number;
  providerSurgeShare: number;
}

export interface HolidayInfo {
  id: string;
  name: string;
  date: string;
  multiplier: number;
}

export interface PricingRule {
  id: string;
  name: string;
  type: 'rush' | 'holiday' | 'peak_hours';
  multiplier: number;
  rushHoursThreshold: number | null;
  holidayDate: string | null;
  peakStartTime: string | null;
  peakEndTime: string | null;
  peakDaysOfWeek: number[] | null;
  categoryId: string | null;
  serviceAreaId: string | null;
  isActive: boolean;
  priority: number;
  platformSurgeShare: number;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export async function getPricingPreview(
  basePrice: number,
  scheduledAt: string,
  categoryId: string,
  city?: string,
): Promise<PricingResult> {
  const res = await api.post<ApiResponse<PricingResult>>('/api/v1/bookings/pricing-preview', {
    basePrice,
    scheduledAt,
    categoryId,
    city,
  });
  return res.data.data;
}

export async function getUpcomingHolidays(): Promise<HolidayInfo[]> {
  const res = await api.get<ApiResponse<HolidayInfo[]>>('/api/v1/bookings/upcoming-holidays');
  return res.data.data;
}
