import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { type ApiResponse } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';

interface WalletBalance {
  id: string;
  available_balance: number;
  pending_balance: number;
  wallet_type: string;
}

interface WalletTransaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
}

interface WalletData {
  balance: WalletBalance;
  transactions: WalletTransaction[];
}

/**
 * Hook for wallet state and actions.
 * Fetches wallet balance + recent transactions, exposes top-up and withdrawal mutations.
 */
export function useWallet() {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const walletQuery = useQuery<WalletData>({
    queryKey: ['wallet'],
    queryFn: async () => {
      const [balanceRes, txRes] = await Promise.all([
        api.get<ApiResponse<WalletBalance>>('/api/v1/wallet/balance'),
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
    availableBalance: walletQuery.data?.balance?.available_balance ?? 0,
    /** Pending balance in centavos */
    pendingBalance: walletQuery.data?.balance?.pending_balance ?? 0,
  };
}
