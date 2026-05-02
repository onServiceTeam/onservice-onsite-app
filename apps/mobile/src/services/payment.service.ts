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

// Phase K CRIT-K12 fix — shape matches packages/api wallet.service
// formatWallet output. Note `availableBalance` + `pendingBalance` are
// the canonical names; backend returns camelCase. The hook
// useWallet.ts uses the same shape post-fix.
export interface WalletBalance {
  id: string;
  userId: string;
  type: string;
  availableBalance: number;
  pendingBalance: number;
  currency: string;
  createdAt: string;
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

// Phase K CRIT-K11 fix — backend mounts wallet routes at
// /api/v1/wallet (singular), NOT /api/v1/wallets. Pre-fix: this
// service used the plural form so EVERY wallet read/top-up call
// from native screens (wallet-topup, booking/checkout) was 404'ing
// silently against the real API. The mismatch was masked because
// useWallet.ts (the React Query hook) used the correct (singular)
// path and the tabs/wallet screen used that hook — but customer
// top-up + checkout flows hit this service directly.
export async function getWalletBalance(): Promise<WalletBalance> {
  const res = await api.get<ApiResponse<WalletBalance>>('/api/v1/wallet');
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
  // Phase K CRIT-K11 fix — see getWalletBalance above.
  const res = await api.post<ApiResponse<TopUpResult>>('/api/v1/wallet/top-up', {
    amount,
    paymentMethod,
  });
  return res.data.data;
}
