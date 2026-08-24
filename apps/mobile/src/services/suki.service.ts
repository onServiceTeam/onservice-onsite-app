import api from './api';
import type { ApiResponse, PaginatedResponse } from './api';

export interface SukiMembership {
  id: string;
  customerId: string;
  providerId: string;
  providerName: string;
  tier: string;
  totalBookings: number;
  totalSpent: number;
  pointsBalance: number;
  pointsMultiplier: number;
  discount: number;
  createdAt: string;
  lastBookingAt: string | null;
}

export interface SukiReward {
  id: string;
  membershipId: string;
  type: string;
  points: number;
  description: string;
  bookingId: string | null;
  createdAt: string;
}

export interface SukiTier {
  name: string;
  minBookings: number;
  pointsMultiplier: number;
  discount: number;
}

export async function getMemberships(): Promise<SukiMembership[]> {
  const res = await api.get<PaginatedResponse<SukiMembership>>('/api/v1/suki/memberships', {
    params: { page: 1, pageSize: 50 },
  });
  return res.data.data;
}

export async function getMembershipRewards(membershipId: string): Promise<SukiReward[]> {
  const res = await api.get<PaginatedResponse<SukiReward>>(
    `/api/v1/suki/memberships/${membershipId}/rewards`,
    {
      params: { page: 1, pageSize: 50 },
    },
  );
  return res.data.data;
}

export async function redeemPoints(
  membershipId: string,
  points: number,
): Promise<{ amountCredited: number; remainingPoints: number }> {
  const res = await api.post<ApiResponse<{ amountCredited: number; remainingPoints: number }>>(
    '/api/v1/suki/redeem',
    {
      membershipId,
      points,
    },
  );
  return res.data.data;
}

export async function getTiers(): Promise<SukiTier[]> {
  const res = await api.get<ApiResponse<SukiTier[]>>('/api/v1/suki/tiers');
  return res.data.data;
}

export interface SukiCustomer {
  id: string;
  customerId: string;
  customerName: string;
  totalBookings: number;
  totalSpent: number;
  tier: string;
  discount: number;
  lastBookingAt: string | null;
}

export async function getProviderSukiCustomers(): Promise<SukiCustomer[]> {
  const res = await api.get<PaginatedResponse<SukiCustomer>>('/api/v1/suki/provider-customers', {
    params: { page: 1, pageSize: 50 },
  });
  return res.data.data;
}
