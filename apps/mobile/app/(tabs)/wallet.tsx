import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getWalletBalance } from '@/services/payment.service';
import api from '@/services/api';
import { formatPHP } from '@/utils/currency';
import { formatDateTime } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

interface Transaction {
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

const TRANSACTION_ICONS: Record<string, string> = {
  payment: '💳',
  escrow_hold: '🔒',
  escrow_release: '🔓',
  commission: '📊',
  payout: '💸',
  refund: '↩️',
  withdrawal: '🏦',
  service_fee: '📋',
  guarantee_contribution: '🛡️',
};

export default function WalletScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const walletQuery = useQuery({
    queryKey: ['wallet'],
    queryFn: getWalletBalance,
    staleTime: 60 * 1000,
  });

  const transactionsQuery = useQuery({
    queryKey: ['walletTransactions'],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean;
        data: Transaction[];
        pagination: { total: number };
      }>('/api/v1/wallets/transactions', { params: { page: 1, pageSize: 20 } });
      return res.data.data;
    },
    staleTime: 60 * 1000,
  });

  const isRefreshing = walletQuery.isRefetching || transactionsQuery.isRefetching;
  const isError = walletQuery.isError || transactionsQuery.isError;
  const onRefresh = useCallback(() => {
    void walletQuery.refetch();
    void transactionsQuery.refetch();
  }, [walletQuery, transactionsQuery]);

  const wallet = walletQuery.data;
  const transactions = transactionsQuery.data ?? [];

  const renderHeader = (): React.ReactElement => (
    <View>
      <View style={styles.balanceCard}>
        {walletQuery.isLoading ? (
          <ActivityIndicator size="large" color={colors.white} />
        ) : (
          <>
            <Text style={styles.balanceLabel}>Available Balance</Text>
            <Text style={styles.balanceAmount}>
              {wallet ? formatPHP(wallet.availableBalance) : '₱0.00'}
            </Text>
            {wallet && wallet.pendingBalance > 0 && (
              <Text style={styles.pendingText}>
                {formatPHP(wallet.pendingBalance)} pending
              </Text>
            )}
            <TouchableOpacity
              style={styles.topUpBtn}
              onPress={() => router.push('/customer/wallet-topup')}
            >
              <Text style={styles.topUpBtnText}>+ Top Up</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <Text style={styles.sectionTitle}>Recent Transactions</Text>
    </View>
  );

  const renderTransaction = ({ item }: { item: Transaction }): React.ReactElement => (
    <View style={styles.txRow}>
      <Text style={styles.txIcon}>{TRANSACTION_ICONS[item.type] ?? '💱'}</Text>
      <View style={styles.txInfo}>
        <Text style={styles.txDescription} numberOfLines={1}>{item.description}</Text>
        <Text style={styles.txDate}>{formatDateTime(item.createdAt)}</Text>
      </View>
      <Text style={[styles.txAmount, item.amount >= 0 ? styles.txCredit : styles.txDebit]}>
        {item.amount >= 0 ? '+' : ''}{formatPHP(Math.abs(item.amount))}
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.base }]}>
      <Text style={styles.title}>Wallet</Text>

      {isError ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyText}>Failed to load wallet data.</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.retryButton}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={transactions}
          renderItem={renderTransaction}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            transactionsQuery.isLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>💳</Text>
                <Text style={styles.emptyText}>No transactions yet</Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.base },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.lg },

  balanceCard: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  balanceLabel: { ...typography.body, color: 'rgba(255,255,255,0.7)', marginBottom: spacing.sm },
  balanceAmount: { fontSize: 36, fontWeight: '800', color: colors.white, lineHeight: 44 },
  pendingText: { ...typography.bodySmall, color: 'rgba(255,255,255,0.6)', marginTop: spacing.sm },
  topUpBtn: {
    marginTop: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
  topUpBtnText: { ...typography.body, fontWeight: '700', color: colors.white },

  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },

  list: { paddingBottom: 100 },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  txIcon: { fontSize: 24, marginRight: spacing.md },
  txInfo: { flex: 1 },
  txDescription: { ...typography.body, color: colors.text },
  txDate: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  txAmount: { ...typography.body, fontWeight: '700' },
  txCredit: { color: colors.success },
  txDebit: { color: colors.text },

  loader: { marginTop: spacing.xl },
  empty: { alignItems: 'center', paddingTop: spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.base },
  emptyText: { ...typography.body, color: colors.textSecondary },
  retryButton: { marginTop: spacing.base },
  retryText: { ...typography.body, color: colors.primary, fontWeight: '600' },
});
