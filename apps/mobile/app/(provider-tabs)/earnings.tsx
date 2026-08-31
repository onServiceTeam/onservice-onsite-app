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
// A7 — shared UI kit for loading/empty/error states.
import { SkeletonCard, EmptyState, ErrorState } from '@/components/ui';
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
} from '@/components/icons';
import type { ComponentType } from 'react';
import { useResponsive } from '@/hooks/useResponsive';
import { getEarningsSummary } from '@/services/provider-tools.service';

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
  const { isPhone } = useResponsive();

  const walletQuery = useQuery({
    queryKey: ['wallet'],
    queryFn: getWalletBalance,
    staleTime: 60 * 1000,
  });

  const summaryQuery = useQuery({
    queryKey: ['providerEarningsSummary'],
    queryFn: getEarningsSummary,
    staleTime: 60 * 1000,
  });

  // Phase K CRIT-K08 fix — replace the hardcoded 7-day chart (which
  // divided wallet.availableBalance by 7 to fake per-day amounts)
  // with the real /api/v1/providers/me/earnings/trends endpoint.
  // Returns one row per day (or week/month) with the actual net
  // earnings for that period.
  const trendsQuery = useQuery<Array<{
    period: string;
    totalEarned: number;
    totalCommission: number;
    netEarned: number;
    jobCount: number;
  }>>({
    queryKey: ['providerEarningsTrends', 'daily', 7],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{
        period: string;
        totalEarned: number | string;
        totalCommission: number | string;
        netEarned: number | string;
        jobCount: number | string;
      }> }>(
        '/api/v1/providers/me/earnings/trends?period=daily&days=7',
      );
      return res.data.data.map((r) => ({
        period: r.period,
        totalEarned: Number(r.totalEarned) || 0,
        totalCommission: Number(r.totalCommission) || 0,
        netEarned: Number(r.netEarned) || 0,
        jobCount: Number(r.jobCount) || 0,
      }));
    },
    staleTime: 60 * 1000,
  });

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

  const isRefreshing = walletQuery.isRefetching || summaryQuery.isRefetching || transactionsQuery.isRefetching || trendsQuery.isRefetching;
  const isError = walletQuery.isError;
  const onRefresh = useCallback(() => {
    void walletQuery.refetch();
    void summaryQuery.refetch();
    void transactionsQuery.refetch();
    void trendsQuery.refetch();
  }, [walletQuery, summaryQuery, transactionsQuery, trendsQuery]);

  const wallet = walletQuery.data;
  const summary = summaryQuery.data;
  const transactions = transactionsQuery.data ?? [];
  const sevenDayTotals = (trendsQuery.data ?? []).reduce(
    (total, row) => ({
      gross: total.gross + row.totalEarned,
      commission: total.commission + row.totalCommission,
      net: total.net + row.netEarned,
      jobs: total.jobs + row.jobCount,
    }),
    { gross: 0, commission: 0, net: 0, jobs: 0 },
  );

  const renderHeader = (): React.ReactElement => (
    <View>
      <View
        style={[styles.overview, !isPhone && styles.wideOverview]}
        accessibilityLabel={isPhone ? 'Provider earnings summary' : 'Wide provider earnings workspace'}
      >
        <View style={!isPhone ? styles.wideSummary : undefined}>
          <View style={styles.earningsCard}>
            {walletQuery.isLoading ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : (
              <>
                <Text style={styles.earningsLabel}>AVAILABLE BALANCE</Text>
                <Text style={styles.earningsAmount}>
                  {wallet ? formatPHP(wallet.availableBalance) : formatPHP(0)}
                </Text>
                {wallet && wallet.pendingBalance > 0 && (
                  <Text style={styles.pendingText}>
                    {formatPHP(wallet.pendingBalance)} reserved for a payout in progress
                  </Text>
                )}
                <Text style={styles.balanceNote}>Available to request through the manual payout workflow.</Text>
                <View style={styles.earningsActions}>
                  <TouchableOpacity
                    style={styles.withdrawButton}
                    onPress={() => router.push(Routes.PROVIDER.WITHDRAW)}
                    accessibilityRole="button"
                    accessibilityLabel="Withdraw available funds"
                  >
                    <Text style={styles.withdrawText}>Withdraw Funds</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.manageAccountsButton}
                    onPress={() => router.push(Routes.PROVIDER.PAYOUT_SETTINGS)}
                    accessibilityRole="button"
                    accessibilityLabel="Manage payout accounts"
                  >
                    <Text style={styles.manageAccountsText}>Manage Accounts</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.historyButton}
                    onPress={() => router.push(Routes.PROVIDER.PAYOUTS)}
                    accessibilityRole="button"
                    accessibilityLabel="Open payout history"
                  >
                    <Text style={styles.historyText}>View payout history</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoCard}>
              <Lock size={22} color={colors.accent} style={styles.infoIconImg} />
              <Text style={styles.infoLabel}>Pending job earnings</Text>
              <Text style={styles.infoValue}>
                {summaryQuery.isLoading
                  ? 'Loading…'
                  : summaryQuery.isError
                    ? 'Unavailable'
                    : formatPHP(summary?.pendingEscrow ?? 0)}
              </Text>
              {(summary?.pendingEscrowReviewCount ?? 0) > 0 && (
                <Text style={styles.balanceNote} accessibilityLabel="Pending earnings support review">
                  {summary!.pendingEscrowReviewCount} job{summary!.pendingEscrowReviewCount === 1 ? '' : 's'} pending support review
                </Text>
              )}
            </View>
            <View style={styles.infoCard}>
              <BarChart3 size={22} color={colors.primary} style={styles.infoIconImg} />
              <Text style={styles.infoLabel}>This month</Text>
              <Text style={styles.infoValue}>
                {summaryQuery.isLoading
                  ? 'Loading…'
                  : summaryQuery.isError
                    ? 'Unavailable'
                    : formatPHP(summary?.earnedThisMonth ?? 0)}
              </Text>
            </View>
            <View style={styles.infoCard}>
              <Coins size={22} color={colors.primary} style={styles.infoIconImg} />
              <Text style={styles.infoLabel}>Minimum withdrawal</Text>
              <Text style={styles.infoValue}>
                {formatPHP(platformConfig.minimumWithdrawalAmount)}
              </Text>
            </View>
          </View>
        </View>

        <View style={!isPhone ? styles.wideInsights : undefined}>
          {/* Phase K CRIT-K08 fix — EarningsChart driven by REAL backend
           data (provider/me/earnings/trends?period=daily&days=7). */}
          <View style={{ marginBottom: spacing.base }}>
            {trendsQuery.isLoading ? (
              <SkeletonCard />
            ) : trendsQuery.isError ? (
              <ErrorState
                compact
                title="Earnings trend unavailable"
                message="We couldn't load your seven-day earnings trend. Try again without leaving this page."
                onRetry={() => void trendsQuery.refetch()}
              />
            ) : trendsQuery.data && trendsQuery.data.length > 0 ? (
              <EarningsChart
                data={trendsQuery.data.map((row) => ({
                  date: row.period.split('T')[0] ?? row.period,
                  amount: row.netEarned,
                }))}
              />
            ) : (
              <EmptyState
                icon={<BarChart3 size={48} color={colors.textTertiary} />}
                title="No earnings trend yet"
                description="Complete jobs to see your daily earnings here."
              />
            )}
          </View>

          {/* UX-123 — the old card reverse-engineered a fictional gross amount
              from the current wallet balance. A wallet includes withdrawals
              and multiple transaction types, so it is not a job-period net.
              This card now uses the server-recorded seven-day earnings rows. */}
          {sevenDayTotals.gross > 0 && (
            <View style={{ marginBottom: spacing.base }}>
              <Text style={styles.breakdownTitle}>Paid jobs, last 7 days</Text>
              <CommissionBreakdown
                gross={sevenDayTotals.gross}
                lines={[
                  {
                    label: 'Recorded platform commission',
                    amount: sevenDayTotals.commission,
                    helpText: 'The commission recorded when these completed jobs were released to your wallet.',
                  },
                ]}
                net={sevenDayTotals.net}
              />
              <Text style={styles.sourceNote}>
                {sevenDayTotals.jobs} paid job{sevenDayTotals.jobs === 1 ? '' : 's'} in this period. Your withdrawable balance can differ after payouts, refunds, or other wallet transactions.
              </Text>
            </View>
          )}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Transaction History</Text>
    </View>
  );

  const renderTransaction = ({ item }: { item: Transaction }): React.ReactElement => {
    const Icon = TRANSACTION_ICONS[item.type] ?? FALLBACK_ICON;
    const content = (
      <>
        <View style={styles.txIconWrap}>
          <Icon size={20} color={colors.primary} />
        </View>
        <View style={styles.txInfo}>
          <Text style={styles.txDescription} numberOfLines={1}>
            {item.description}
          </Text>
          <Text style={styles.txDate}>{formatDateTime(item.createdAt)}</Text>
        </View>
        <Text style={[styles.txAmount, item.amount >= 0 ? styles.txCredit : styles.txDebit]}>
          {item.amount >= 0 ? '+' : ''}
          {formatPHP(Math.abs(item.amount))}
        </Text>
      </>
    );
    if (item.bookingId) {
      return (
        <TouchableOpacity
          style={styles.txRow}
          onPress={() => router.push(`/provider/job/${item.bookingId}`)}
          accessibilityRole="button"
          accessibilityLabel={`Open job for ${item.description}`}
        >
          {content}
        </TouchableOpacity>
      );
    }
    return <View style={styles.txRow}>{content}</View>;
  };

  return (
    <View
      style={[
        styles.container,
        !isPhone && styles.wideContainer,
        { paddingTop: insets.top + spacing.base },
      ]}
    >
      <Text style={styles.title}>Earnings</Text>

      {isError ? (
        <ErrorState
          message="We couldn't load your earnings. Please check your connection and try again."
          onRetry={onRefresh}
        />
      ) : (
        <FlatList
          data={transactions}
          renderItem={renderTransaction}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={colors.secondary}
            />
          }
          ListEmptyComponent={
            transactionsQuery.isLoading ? (
              <View style={styles.list}>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </View>
            ) : transactionsQuery.isError ? (
              <ErrorState
                compact
                title="Transaction history unavailable"
                message="Your balance and earnings summary are still available above."
                onRetry={() => void transactionsQuery.refetch()}
              />
            ) : (
              <EmptyState
                icon={<Banknote size={48} color={colors.textTertiary} />}
                title="No transactions yet"
                description="Complete jobs to start earning."
              />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.base },
  wideContainer: {
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
  },
  overview: {},
  wideOverview: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  wideSummary: { width: 360 },
  wideInsights: { flex: 1, minWidth: 0 },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.lg },

  earningsCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  earningsLabel: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '700', letterSpacing: 0.6, marginBottom: spacing.sm },
  earningsAmount: { fontSize: 36, fontWeight: '800', color: colors.text, lineHeight: 44 },
  pendingText: { ...typography.bodySmall, color: colors.warning, marginTop: spacing.sm, textAlign: 'center' },
  balanceNote: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' },
  earningsActions: { marginTop: spacing.lg, width: '100%' },
  withdrawButton: {
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.xl,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
  },
  withdrawText: { ...typography.button, color: colors.white },
  manageAccountsButton: {
    minHeight: 44,
    marginTop: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.textTertiary,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  manageAccountsText: { ...typography.button, color: colors.text },
  historyButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  historyText: { ...typography.bodySmall, color: colors.secondary, fontWeight: '700' },

  infoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  infoCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    alignItems: 'center',
  },
  infoIcon: { fontSize: 24, marginBottom: spacing.xs },
  infoIconImg: { marginBottom: spacing.xs },
  infoLabel: { ...typography.caption, color: colors.textTertiary, marginBottom: 2 },
  infoValue: { ...typography.body, color: colors.text, fontWeight: '700' },

  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },
  breakdownTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.sm },
  sourceNote: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 17 },

  list: { paddingBottom: 100 },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  txIcon: { fontSize: 24, marginRight: spacing.md },
  txIconWrap: {
    marginRight: spacing.md,
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
