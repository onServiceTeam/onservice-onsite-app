import api from './api';
import type { ApiResponse } from './api';

export interface PaymentIntent {
  id: string;
  bookingId: string;
  paymongoIntentId: string | null;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  clientKey: string | null;
  checkoutUrl: string | null;
  createdAt: string;
}

export interface WalletBalance {
  id: string;
  availableBalance: number;
  pendingBalance: number;
}

export async function createPaymentIntent(
  bookingId: string,
  paymentMethod: string,
): Promise<PaymentIntent> {
  const res = await api.post<ApiResponse<PaymentIntent>>('/api/v1/payments/intent', {
    bookingId,
    paymentMethod,
  });
  return res.data.data;
}

export async function getWalletBalance(): Promise<WalletBalance> {
  const res = await api.get<ApiResponse<WalletBalance>>('/api/v1/wallets');
  return res.data.data;
}

export interface TopUpResult {
  topUpId: string;
  amount: number;
  paymentMethod: string;
  paymentIntent: PaymentIntent;
  message: string;
}

export async function topUpWallet(amount: number, paymentMethod: string): Promise<TopUpResult> {
  const res = await api.post<ApiResponse<TopUpResult>>('/api/v1/wallets/top-up', {
    amount,
    paymentMethod,
  });
  return res.data.data;
}
