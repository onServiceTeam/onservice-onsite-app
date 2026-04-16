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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getWalletBalance } from '@/services/payment.service';
import api from '@/services/api';
import { formatPHP } from '@/utils/currency';
import { formatDateTime } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';

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
  tip: '🎁',
};

export default function EarningsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
      }>('/api/v1/wallets/transactions', { params: { page: 1, pageSize: 30 } });
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
      <View style={styles.earningsCard}>
        {walletQuery.isLoading ? (
          <ActivityIndicator size="large" color={colors.white} />
        ) : (
          <>
            <Text style={styles.earningsLabel}>Available Balance</Text>
            <Text style={styles.earningsAmount}>
              {wallet ? formatPHP(wallet.availableBalance) : '₱0.00'}
            </Text>
            {wallet && wallet.pendingBalance > 0 && (
              <Text style={styles.pendingText}>
                {formatPHP(wallet.pendingBalance)} in escrow
              </Text>
            )}
            <View style={styles.earningsActions}>
              <TouchableOpacity
                style={styles.withdrawButton}
                onPress={() => router.push('/provider/withdraw' as never)}
              >
                <Text style={styles.withdrawText}>Withdraw Funds</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.withdrawButton, { marginTop: spacing.sm }]}
                onPress={() => router.push('/provider/payouts' as never)}
              >
                <Text style={styles.withdrawText}>Payout History</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      <View style={styles.infoRow}>
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>💰</Text>
          <Text style={styles.infoLabel}>Min Withdrawal</Text>
          <Text style={styles.infoValue}>{formatPHP(platformConfig.minimumWithdrawalAmount)}</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>📊</Text>
          <Text style={styles.infoLabel}>Commission</Text>
          <Text style={styles.infoValue}>12-20%</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Transaction History</Text>
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
      <Text style={styles.title}>Earnings</Text>

      {isError ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyText}>Failed to load earnings data.</Text>
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
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.secondary} />
          }
          ListEmptyComponent={
            transactionsQuery.isLoading ? (
              <ActivityIndicator size="large" color={colors.secondary} style={styles.loader} />
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>💳</Text>
                <Text style={styles.emptyText}>No transactions yet</Text>
                <Text style={styles.emptyHint}>Complete jobs to start earning</Text>
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

  earningsCard: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  earningsLabel: { ...typography.body, color: 'rgba(255,255,255,0.7)', marginBottom: spacing.sm },
  earningsAmount: { fontSize: 36, fontWeight: '800', color: colors.white, lineHeight: 44 },
  pendingText: { ...typography.bodySmall, color: 'rgba(255,255,255,0.6)', marginTop: spacing.sm },
  earningsActions: { marginTop: spacing.lg },
  withdrawButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.full,
  },
  withdrawText: { ...typography.button, color: colors.white },

  infoRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  infoCard: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.base,
    alignItems: 'center',
  },
  infoIcon: { fontSize: 24, marginBottom: spacing.xs },
  infoLabel: { ...typography.caption, color: colors.textTertiary, marginBottom: 2 },
  infoValue: { ...typography.body, color: colors.text, fontWeight: '700' },

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
  emptyHint: { ...typography.bodySmall, color: colors.textTertiary, marginTop: spacing.xs },
  retryButton: { marginTop: spacing.base },
  retryText: { ...typography.body, color: colors.secondary, fontWeight: '600' },
});
