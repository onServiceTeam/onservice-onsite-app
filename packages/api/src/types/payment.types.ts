export type PaymentMethod = 'gcash' | 'maya' | 'card' | 'qrph';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export type WalletType =
  | 'customer'
  | 'provider'
  | 'platform_escrow'
  | 'platform_revenue'
  | 'guarantee_fund';

export type TransactionType =
  | 'payment'
  | 'escrow_hold'
  | 'escrow_release'
  | 'commission'
  | 'payout'
  | 'refund'
  | 'withdrawal'
  | 'guarantee_contribution'
  | 'service_fee';

export interface Wallet {
  id: string;
  userId: string | null;
  type: WalletType;
  availableBalance: number;  // in centavos
  pendingBalance: number;    // in centavos
  currency: 'PHP';
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  bookingId: string | null;
  type: TransactionType;
  amount: number;            // in centavos (positive = credit, negative = debit)
  balanceAfter: number;      // in centavos
  description: string;
  referenceId: string | null;
  createdAt: Date;
}
