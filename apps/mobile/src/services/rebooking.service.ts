import api from './api';
import type { ApiResponse } from './api';

export interface RebookingSuggestion {
  providerId: string;
  providerName: string;
  businessName: string;
  averageRating: string;
  totalReviews: number;
  totalJobsCompleted: number;
  tier: string;
  basePrice: number | null;
  distanceKm: number | null;
  previouslyBooked: boolean;
}

export interface RebookingData {
  originalBooking: {
    id: string;
    categoryId: string;
    subcategoryId: string | null;
    city: string;
    province: string;
    scheduledAt: string;
    description: string;
  };
  previousProviders: RebookingSuggestion[];
  availableProviders: RebookingSuggestion[];
}

export interface BookingHistoryItem {
  bookingId: string;
  categoryName: string;
  subcategoryName: string | null;
  providerName: string;
  providerId: string;
  scheduledAt: string;
  totalAmount: number;
  status: string;
}

export async function getRebookingSuggestions(bookingId: string): Promise<RebookingData> {
  const res = await api.get<ApiResponse<RebookingData>>(`/api/v1/bookings/${bookingId}/rebooking-suggestions`);
  return res.data.data;
}

export async function getBookingHistory(
  categoryId?: string,
  limit = 10,
): Promise<BookingHistoryItem[]> {
  const res = await api.get<ApiResponse<BookingHistoryItem[]>>('/api/v1/bookings/history/rebookable', {
    params: { categoryId, limit },
  });
  return res.data.data;
}
