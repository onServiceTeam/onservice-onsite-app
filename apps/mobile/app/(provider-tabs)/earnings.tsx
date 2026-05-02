import React, { useCallback } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
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
// Phase 14 R5-complete — EarningsChart + CommissionBreakdown panels.
import EarningsChart from '@/components/provider/EarningsChart';
import CommissionBreakdown from '@/components/provider/CommissionBreakdown';
import { platformConfig } from '@/config/platform.config';
import {
  CreditCard,
  Lock,
  Unlock,
  BarChart3,
  Banknote,
  Undo2,
  Building2,
  ClipboardList,
  Shield,
  Gift,
  Repeat,
  Coins,
  AlertTriangle,
} from '@/components/icons';
import type { ComponentType } from 'react';

import { Routes } from '@/config/navigation';
type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

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

const TRANSACTION_ICONS: Record<string, IconComponent> = {
  payment: CreditCard,
  escrow_hold: Lock,
  escrow_release: Unlock,
  commission: BarChart3,
  payout: Banknote,
  refund: Undo2,
  withdrawal: Building2,
  service_fee: ClipboardList,
  guarantee_contribution: Shield,
  tip: Gift,
};

const FALLBACK_ICON: IconComponent = Repeat;

export default function EarningsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const walletQuery = useQuery({
    queryKey: ['wallet'],
    queryFn: getWalletBalance,
    staleTime: 60 * 1000,
  });

  // Phase K CRIT-K08 fix — replace the hardcoded 7-day chart (which
  // divided wallet.availableBalance by 7 to fake per-day amounts)
  // with the real /api/v1/providers/me/earnings/trends endpoint.
  // Returns one row per day (or week/month) with the actual net
  // earnings for that period.
  const trendsQuery = useQuery<Array<{ period: string; netEarned: number }>>({
    queryKey: ['providerEarningsTrends', 'daily', 7],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{ period: string; netEarned: number | string }> }>(
        '/api/v1/providers/me/earnings/trends?period=daily&days=7',
      );
      return res.data.data.map((r) => ({
        period: r.period,
        netEarned: Number(r.netEarned) || 0,
      }));
    },
    staleTime: 60 * 1000,
  });

  // Phase K CRIT-K09 fix — fetch the provider's real tier so the
  // CommissionBreakdown panel can show the correct rate. Pre-fix
  // displayed a hardcoded "12%" regardless of tier.
  const providerQuery = useQuery<{ tier: string }>({
    queryKey: ['providerMe'],
    queryFn: async () => {
      const res = await api.get<{ data: { tier: string } }>('/api/v1/providers/me');
      return { tier: res.data.data.tier };
    },
    staleTime: 5 * 60 * 1000,
  });

  // Tier-specific commission rate (live from platformConfig table).
  const providerTier = providerQuery.data?.tier ?? 'new';
  const tierCommissionRate =
    platformConfig.commissionRates[providerTier] ?? platformConfig.commissionRates.new ?? 0.15;
  const tierCommissionPct = Math.round(tierCommissionRate * 100);

  const transactionsQuery = useQuery({
    queryKey: ['walletTransactions'],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean;
        data: Transaction[];
        pagination: { total: number };
      }>('/api/v1/wallet/transactions', { params: { page: 1, pageSize: 30 } });
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
              {wallet ? formatPHP(wallet.availableBalance) : formatPHP(0)}
            </Text>
            {wallet && wallet.pendingBalance > 0 && (
              <Text style={styles.pendingText}>
                {formatPHP(wallet.pendingBalance)} in escrow
              </Text>
            )}
            <View style={styles.earningsActions}>
              <TouchableOpacity
                style={styles.withdrawButton}
                onPress={() => router.push(Routes.PROVIDER.WITHDRAW)}
              >
                <Text style={styles.withdrawText}>Withdraw Funds</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.withdrawButton, { marginTop: spacing.sm }]}
                onPress={() => router.push(Routes.PROVIDER.PAYOUTS)}
              >
                <Text style={styles.withdrawText}>Payout History</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      <View style={styles.infoRow}>
        <View style={styles.infoCard}>
          <Coins size={22} color={colors.primary} style={styles.infoIconImg} />
          <Text style={styles.infoLabel}>Min Withdrawal</Text>
          <Text style={styles.infoValue}>{formatPHP(platformConfig.minimumWithdrawalAmount)}</Text>
        </View>
        <View style={styles.infoCard}>
          <BarChart3 size={22} color={colors.primary} style={styles.infoIconImg} />
          <Text style={styles.infoLabel}>Your Commission</Text>
          {/* Phase K CRIT-K09 fix — show this provider's actual tier
               commission, not the platform-wide range. */}
          <Text style={styles.infoValue}>{`${tierCommissionPct}%`}</Text>
        </View>
      </View>

      {/* Phase K CRIT-K08 fix — EarningsChart driven by REAL backend
           data (provider/me/earnings/trends?period=daily&days=7). */}
      <View style={{ marginBottom: spacing.base }}>
        <EarningsChart
          data={(trendsQuery.data ?? []).map((row) => ({
            date: row.period.split('T')[0] ?? row.period,
            amount: row.netEarned,
          }))}
        />
      </View>

      {/* Phase K CRIT-K09 fix — CommissionBreakdown uses the provider's
           ACTUAL tier-specific commission rate (was hardcoded 12%). */}
      {wallet && wallet.availableBalance > 0 && (
        <View style={{ marginBottom: spacing.base }}>
          <CommissionBreakdown
            gross={Math.round(wallet.availableBalance / (1 - tierCommissionRate - platformConfig.guaranteeFundRate))}
            lines={[
              {
                label: 'Platform commission',
                amount: Math.round(wallet.availableBalance * (tierCommissionRate / (1 - tierCommissionRate))),
                pct: tierCommissionPct,
                helpText: `Your tier (${providerTier}) commission rate. Earn higher tier for lower commission.`,
              },
              {
                label: 'Guarantee fund',
                amount: Math.round(wallet.availableBalance * (platformConfig.guaranteeFundRate / (1 - tierCommissionRate))),
                pct: Math.round(platformConfig.guaranteeFundRate * 100 * 10) / 10,
                helpText: 'Funds the platform guarantee program for completed bookings.',
              },
            ]}
            net={wallet.availableBalance}
          />
        </View>
      )}

      <Text style={styles.sectionTitle}>Transaction History</Text>
    </View>
  );

  const renderTransaction = ({ item }: { item: Transaction }): React.ReactElement => {
    const Icon = TRANSACTION_ICONS[item.type] ?? FALLBACK_ICON;
    return (
      <View style={styles.txRow}>
        <View style={styles.txIconWrap}><Icon size={20} color={colors.primary} /></View>
        <View style={styles.txInfo}>
          <Text style={styles.txDescription} numberOfLines={1}>{item.description}</Text>
          <Text style={styles.txDate}>{formatDateTime(item.createdAt)}</Text>
        </View>
        <Text style={[styles.txAmount, item.amount >= 0 ? styles.txCredit : styles.txDebit]}>
          {item.amount >= 0 ? '+' : ''}{formatPHP(Math.abs(item.amount))}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.base }]}>
      <Text style={styles.title}>Earnings</Text>

      {isError ? (
        <View style={styles.empty}>
          <AlertTriangle size={40} color={colors.error} style={styles.emptyIconImg} />
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
                <CreditCard size={40} color={colors.textTertiary} style={styles.emptyIconImg} />
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
  infoIconImg: { marginBottom: spacing.xs },
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
  txIconWrap: { marginRight: spacing.md, width: 28, alignItems: 'center' },
  txInfo: { flex: 1 },
  txDescription: { ...typography.body, color: colors.text },
  txDate: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  txAmount: { ...typography.body, fontWeight: '700' },
  txCredit: { color: colors.success },
  txDebit: { color: colors.text },

  loader: { marginTop: spacing.xl },
  empty: { alignItems: 'center', paddingTop: spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.base },
  emptyIconImg: { marginBottom: spacing.base },
  emptyText: { ...typography.body, color: colors.textSecondary },
  emptyHint: { ...typography.bodySmall, color: colors.textTertiary, marginTop: spacing.xs },
  retryButton: { marginTop: spacing.base },
  retryText: { ...typography.body, color: colors.secondary, fontWeight: '600' },
});
