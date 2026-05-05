import React, { useCallback } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
// Phase E CRIT-112 fix — payouts page no longer ships hardcoded fake
// chart + commission preview. EarningsChart now hits the real
// /providers/me/earnings/trends endpoint (same as the earnings tab
// per CRIT-K08); CommissionBreakdown computed from the provider's
// real tier (per CRIT-K09 / CRIT-101). The static 50000/75000/etc
// numbers are gone.
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
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { formatPHP } from '@/utils/currency';
import { formatDateTime, formatRelative } from '@/utils/date';
import { Badge } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';
// Phase 14 R5-complete — PaginationLoader + EarningsChart + CommissionBreakdown panels.
import PaginationLoader from '@/components/PaginationLoader';
import EarningsChart from '@/components/provider/EarningsChart';
import CommissionBreakdown from '@/components/provider/CommissionBreakdown';
import { AlertTriangle, Banknote } from '@/components/icons';

interface Payout {
  id: string;
  providerId: string;
  amount: number;
  method: string;
  destinationAccount: string;
  status: string;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

const METHOD_LABELS: Record<string, string> = {
  gcash: 'GCash',
  maya: 'Maya',
  bank_instapay: 'InstaPay',
  bank_pesonet: 'PESONet',
};

const STATUS_COLORS: Record<string, string> = {
  pending: colors.statusPending,
  processing: colors.statusInProgress,
  completed: colors.statusCompleted,
  failed: colors.statusCancelled,
};

async function getPayouts(page: number, pageSize: number): Promise<{
  payouts: Payout[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const res = await api.get<{
    success: boolean;
    data: Payout[];
    pagination: { total: number; page: number; pageSize: number; totalPages: number };
  }>('/api/v1/wallet/payouts', { params: { page, pageSize } });
  return { payouts: res.data.data, ...res.data.pagination };
}

export default function PayoutsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isRefetching,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['payouts'],
    queryFn: ({ pageParam = 1 }) => getPayouts(pageParam as number, 20),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    staleTime: 30 * 1000,
  });

  const payouts = data?.pages.flatMap((p) => p.payouts) ?? [];
  const onRefresh = useCallback(() => { void refetch(); }, [refetch]);

  // Phase E CRIT-112 fix — real /providers/me/earnings/trends data
  // for the chart preview (was hardcoded 50000/75000/...). 30-day
  // window so the chart matches the totals below.
  const trendsQuery = useQuery<Array<{ period: string; netEarned: number; totalEarned: number; totalCommission: number }>>({
    queryKey: ['providerEarningsTrends', 'daily', 30],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{ period: string; netEarned: number | string; totalEarned: number | string; totalCommission: number | string }> }>(
        '/api/v1/providers/me/earnings/trends?period=daily&days=30',
      );
      return res.data.data.map((r) => ({
        period: r.period,
        netEarned: Number(r.netEarned) || 0,
        totalEarned: Number(r.totalEarned) || 0,
        totalCommission: Number(r.totalCommission) || 0,
      }));
    },
    staleTime: 60 * 1000,
  });

  // Provider tier for the commission breakdown.
  const providerMeQuery = useQuery<{ tier: string }>({
    queryKey: ['providerMe'],
    queryFn: async () => {
      const res = await api.get<{ data: { tier: string } }>('/api/v1/providers/me');
      return { tier: res.data.data.tier };
    },
    staleTime: 5 * 60 * 1000,
  });
  const providerTier = providerMeQuery.data?.tier ?? 'new';
  const tierCommissionRate =
    platformConfig.commissionRates[providerTier] ?? platformConfig.commissionRates.new ?? 0.15;
  const tierCommissionPct = Math.round(tierCommissionRate * 100);

  // Aggregate the 30-day trends for the breakdown card.
  const totals = (trendsQuery.data ?? []).reduce(
    (acc, row) => ({
      gross: acc.gross + row.totalEarned,
      commission: acc.commission + row.totalCommission,
      net: acc.net + row.netEarned,
      total: acc.total + 1,
    }),
    { gross: 0, commission: 0, net: 0, total: 0 },
  );

  const renderItem = ({ item }: { item: Payout }): React.ReactElement => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Badge
          label={item.status.toUpperCase()}
          backgroundColor={STATUS_COLORS[item.status] ?? colors.textTertiary}
          size="sm"
        />
        <Text style={styles.cardDate}>{formatRelative(item.createdAt)}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardAmount}>{formatPHP(item.amount)}</Text>
        <Text style={styles.cardMethod}>
          {METHOD_LABELS[item.method] ?? item.method}
        </Text>
      </View>
      <Text style={styles.cardAccount} numberOfLines={1}>
        To: {item.destinationAccount}
      </Text>
      {item.completedAt && (
        <Text style={styles.completedText}>
          Completed {formatDateTime(item.completedAt)}
        </Text>
      )}
      {item.failureReason && (
        <Text style={styles.failureText}>Reason: {item.failureReason}</Text>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* BUG-PHASE172-01 fix — pre-fix the Payout History screen had
          no link to the Withdraw screen. Provider had to navigate
          back to the Earnings tab to request a new withdrawal.
          Now: a Request Withdrawal button in the header for direct
          access. Same UX-gap family as Phase 169-170. */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Payout History</Text>
        <TouchableOpacity
          style={styles.headerCta}
          onPress={() => router.push('/provider/withdraw')}
          accessibilityLabel="Request a new withdrawal"
        >
          <Text style={styles.headerCtaText}>Withdraw</Text>
        </TouchableOpacity>
      </View>

      {/* Phase E CRIT-112 fix — EarningsChart + CommissionBreakdown
           now driven by REAL backend data. */}
      <View style={{ paddingHorizontal: spacing.base, marginTop: spacing.sm }}>
        <EarningsChart
          data={(trendsQuery.data ?? []).map((row) => ({
            date: row.period.split('T')[0] ?? row.period,
            amount: row.netEarned,
          }))}
        />
        {totals && totals.total > 0 && (
          <View style={{ marginTop: spacing.sm }}>
            <CommissionBreakdown
              gross={totals.gross}
              lines={[
                {
                  label: `Platform commission (${tierCommissionPct}%)`,
                  amount: totals.commission,
                  pct: tierCommissionPct,
                  helpText: `Your tier (${providerTier}). Earn higher tier for lower commission.`,
                },
              ]}
              net={totals.net}
            />
          </View>
        )}
      </View>

      {isError ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}><AlertTriangle size={48} color={colors.error} /></View>
          <Text style={styles.emptyText}>Failed to load payouts.</Text>
          <TouchableOpacity onPress={onRefresh} style={{ marginTop: spacing.base }}>
            <Text style={{ color: colors.secondary, fontWeight: '600' }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={payouts}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.secondary} />
          }
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          onEndReachedThreshold={0.3}
          // Phase 14 R5-complete — PaginationLoader replaces inline ActivityIndicator
          ListFooterComponent={
            <PaginationLoader
              loading={isFetchingNextPage}
              hasMore={!!hasNextPage}
              endLabel="No more payouts"
            />
          }
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator size="large" color={colors.secondary} style={styles.loader} />
            ) : (
              <View style={styles.empty}>
                <View style={styles.emptyIconWrap}><Banknote size={48} color={colors.textTertiary} /></View>
                <Text style={styles.emptyText}>No payouts yet</Text>
                <Text style={styles.emptyHint}>Completed withdrawals will appear here</Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text, flex: 1 },
  // BUG-PHASE172-01 fix — Request Withdrawal CTA in header.
  headerCta: {
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    minHeight: 44,
    justifyContent: 'center' as const,
  },
  headerCtaText: { color: colors.white, fontWeight: '600', fontSize: 14 },

  list: { padding: spacing.base, paddingBottom: 80 },
  card: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardDate: { ...typography.caption, color: colors.textTertiary },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  cardAmount: { ...typography.h2, color: colors.text },
  cardMethod: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  cardAccount: { ...typography.bodySmall, color: colors.textTertiary, marginBottom: spacing.xs },
  completedText: { ...typography.caption, color: colors.success, marginTop: spacing.xs },
  failureText: { ...typography.caption, color: colors.error, marginTop: spacing.xs },

  loader: { marginTop: spacing.xl },
  empty: { alignItems: 'center', paddingTop: spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.base },
  emptyIconWrap: { marginBottom: spacing.base, alignItems: 'center' as const },
  emptyText: { ...typography.body, color: colors.textSecondary },
  emptyHint: { ...typography.bodySmall, color: colors.textTertiary, marginTop: spacing.xs },
});
