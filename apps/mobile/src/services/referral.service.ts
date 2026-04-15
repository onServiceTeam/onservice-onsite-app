import api from './api';
import type { ApiResponse } from './api';

export interface ReferralCode {
  id: string;
  code: string;
  type: string;
  usesCount: number;
  maxUses: number | null;
  referrerBonus: number;
  refereeBonus: number;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export interface Redemption {
  id: string;
  referrerId: string;
  refereeId: string;
  referrerBonus: number;
  refereeBonus: number;
  referrerCredited: boolean;
  refereeCredited: boolean;
  qualifyingBookingId: string | null;
  createdAt: string;
}

export interface MyReferrals {
  code: ReferralCode | null;
  redemptions: Redemption[];
}

export async function getMyCode(): Promise<ReferralCode> {
  const res = await api.get<ApiResponse<ReferralCode>>('/api/v1/referrals/my-code');
  return res.data.data;
}

export async function redeemCode(code: string): Promise<Redemption> {
  const res = await api.post<ApiResponse<Redemption>>('/api/v1/referrals/redeem', { code });
  return res.data.data;
}

export async function getMyReferrals(): Promise<MyReferrals> {
  const res = await api.get<ApiResponse<MyReferrals>>('/api/v1/referrals/my-referrals');
  return res.data.data;
}
