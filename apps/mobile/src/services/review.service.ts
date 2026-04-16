import api from './api';
import type { ApiResponse } from './api';

export interface Review {
  id: string;
  bookingId: string;
  reviewerId: string;
  providerId: string;
  rating: number;
  qualityRating: number | null;
  punctualityRating: number | null;
  professionalismRating: number | null;
  communicationRating: number | null;
  valueRating: number | null;
  comment: string | null;
  providerResponse: string | null;
  providerResponseAt: string | null;
  isVisible: boolean;
  isFlagged: boolean;
  images: { id: string; imageUrl: string }[];
  createdAt: string;
}

export interface ReviewAggregate {
  overall: number | null;
  quality: number | null;
  punctuality: number | null;
  professionalism: number | null;
  communication: number | null;
  value: number | null;
  totalReviews: number;
}

export interface CreateReviewPayload {
  bookingId: string;
  rating: number;
  qualityRating?: number;
  punctualityRating?: number;
  professionalismRating?: number;
  communicationRating?: number;
  valueRating?: number;
  comment?: string;
  tags?: string[];
  privateNote?: string;
  imageUrls?: string[];
}

export async function createReview(data: CreateReviewPayload): Promise<Review> {
  const res = await api.post<ApiResponse<Review>>('/api/v1/reviews', data);
  return res.data.data;
}

export async function getProviderReviews(
  providerId: string,
  page = 1,
  pageSize = 20,
): Promise<{ reviews: Review[]; aggregate: ReviewAggregate; total: number }> {
  const res = await api.get<{
    success: boolean;
    data: Review[];
    aggregate: ReviewAggregate;
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }>(`/api/v1/reviews/provider/${providerId}`, { params: { page, pageSize } });
  return {
    reviews: res.data.data,
    aggregate: res.data.aggregate,
    total: res.data.pagination.total,
  };
}

export async function getBookingReview(bookingId: string): Promise<Review | null> {
  const res = await api.get<ApiResponse<Review | null>>(`/api/v1/reviews/booking/${bookingId}`);
  return res.data.data;
}
