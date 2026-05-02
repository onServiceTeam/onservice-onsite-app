import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { type ApiResponse } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';

// Phase K CRIT-K12 fix — backend formatWallet returns camelCase
// fields (availableBalance, pendingBalance, walletType — see
// packages/api/src/services/wallet.service.ts:formatWallet). Pre-fix
// this hook expected snake_case so the wallet UI rendered NaN /
// undefined for the balance everywhere it was used (tabs/wallet,
// home cards). Switching to camelCase here aligns with both the
// backend response shape and the convention used throughout the rest
// of the mobile codebase.
interface WalletBalance {
  id: string;
  userId: string;
  type: string;
  availableBalance: number;
  pendingBalance: number;
  currency: string;
  createdAt: string;
}

interface WalletTransaction {
  id: string;
  walletId: string;
  bookingId: string | null;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string;
  referenceId: string | null;
  createdAt: string;
}

interface WalletData {
  balance: WalletBalance;
  transactions: WalletTransaction[];
}

/**
 * Hook for wallet state and actions.
 * Fetches wallet balance + recent transactions, exposes top-up and withdrawal mutations.
 *
 * Phase K CRIT-K11 fix — backend mounts at /api/v1/wallet (singular)
 * with the GET / endpoint returning the wallet (formatWallet output)
 * directly. Pre-fix: this hook hit /api/v1/wallet/balance which 404'd
 * silently. The transactions/top-up/withdraw paths were already
 * correct (they use the singular form); only the balance endpoint
 * was off.
 */
export function useWallet() {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const walletQuery = useQuery<WalletData>({
    queryKey: ['wallet'],
    queryFn: async () => {
      const [balanceRes, txRes] = await Promise.all([
        api.get<ApiResponse<WalletBalance>>('/api/v1/wallet'),
        api.get<ApiResponse<WalletTransaction[]>>('/api/v1/wallet/transactions?pageSize=20'),
      ]);
      return {
        balance: balanceRes.data.data,
        transactions: txRes.data.data,
      };
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const topUpMutation = useMutation({
    mutationFn: async (params: { amount: number; paymentMethod: string }) => {
      const res = await api.post<ApiResponse<unknown>>('/api/v1/wallet/top-up', params);
      return res.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async (params: { amount: number; method: string; destinationAccount: string }) => {
      const res = await api.post<ApiResponse<unknown>>('/api/v1/wallet/withdraw', params);
      return res.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
  });

  return {
    balance: walletQuery.data?.balance ?? null,
    transactions: walletQuery.data?.transactions ?? [],
    isLoading: walletQuery.isLoading,
    isError: walletQuery.isError,
    error: walletQuery.error,
    refetch: walletQuery.refetch,
    topUp: topUpMutation.mutateAsync,
    isTopUpLoading: topUpMutation.isPending,
    withdraw: withdrawMutation.mutateAsync,
    isWithdrawLoading: withdrawMutation.isPending,
    /** Available balance in centavos */
    availableBalance: walletQuery.data?.balance?.availableBalance ?? 0,
    /** Pending balance in centavos */
    pendingBalance: walletQuery.data?.balance?.pendingBalance ?? 0,
  };
}
