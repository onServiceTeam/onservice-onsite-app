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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { formatPHP } from '@/utils/currency';
import { formatDateTime, formatRelative } from '@/utils/date';
// A7 — shared UI kit for loading/empty/error states.
import { Badge, SkeletonCard, EmptyState, ErrorState } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
// Phase 14 R5-complete — paginated real payout ledger.
import PaginationLoader from '@/components/PaginationLoader';
import { Routes } from '@/config/navigation';
import { Building2 } from '@/components/icons';
import { useResponsive } from '@/hooks/useResponsive';

interface Payout {
  id: string;
  providerId: string;
  amount: number;
  method: string;
  destinationAccount: string;
  status: string;
  failureReason: string | null;
  rejectionReason: string | null;
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
  aml_review_pending: colors.warning,
  approved: colors.info,
  processing: colors.statusInProgress,
  completed: colors.statusCompleted,
  rejected: colors.error,
  failed: colors.statusCancelled,
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending review',
  aml_review_pending: 'Large payout review',
  approved: 'Approved',
  processing: 'Processing',
  completed: 'Completed',
  rejected: 'Rejected',
  failed: 'Failed',
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
  const { isPhone } = useResponsive();

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

  const renderItem = ({ item }: { item: Payout }): React.ReactElement => (
    <View style={[styles.card, !isPhone && styles.cardWide]}>
      <View style={styles.cardTop}>
        <Badge
          label={STATUS_LABELS[item.status] ?? item.status.replace(/_/g, ' ')}
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
      {item.rejectionReason && (
        <Text style={styles.failureText}>Reason: {item.rejectionReason}</Text>
      )}
      {item.status === 'aml_review_pending' && (
        <Text style={styles.reviewText}>
          This withdrawal is on an internal large-payout review hold before standard processing. This does not mean a legal report was filed or required.
        </Text>
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
      <View style={[styles.header, !isPhone && styles.headerWide]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Payout History</Text>
        <TouchableOpacity
          style={styles.headerCta}
          onPress={() => router.push(Routes.PROVIDER.WITHDRAW)}
          accessibilityLabel="Request a new withdrawal"
        >
          <Text style={styles.headerCtaText}>Withdraw</Text>
        </TouchableOpacity>
      </View>

      <View
        style={[styles.notice, !isPhone && styles.noticeWide]}
        accessibilityLabel={isPhone ? 'Payout processing notice' : 'Wide payout ledger workspace'}
      >
        <Text style={styles.noticeTitle}>Manual withdrawal history</Text>
        <Text style={styles.noticeText}>
          Each request is reviewed by the onService finance team. Status changes and any rejection or failure reason appear here. Pull to refresh for the latest record.
        </Text>
      </View>

      {isError ? (
        <ErrorState
          message="We couldn't load your payouts. Please check your connection and try again."
          onRetry={onRefresh}
        />
      ) : (
        <FlatList
          data={payouts}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, !isPhone && styles.listWide]}
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
              <View style={styles.list}>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </View>
            ) : (
              <EmptyState
                icon={<Building2 size={48} color={colors.textTertiary} />}
                title="No payouts yet"
                description="Completed withdrawals will appear here."
              />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // App design refresh — soft canvas so the white payout cards lift off the page.
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerWide: { width: '100%', maxWidth: 1040, alignSelf: 'center' },
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

  notice: {
    backgroundColor: colors.infoLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginHorizontal: spacing.base,
    marginTop: spacing.base,
  },
  noticeWide: { width: '100%', maxWidth: 1008, alignSelf: 'center', marginHorizontal: 0 },
  noticeTitle: { ...typography.body, color: colors.text, fontWeight: '700', marginBottom: spacing.xs },
  noticeText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },
  list: { padding: spacing.base, paddingBottom: 80 },
  listWide: { width: '100%', maxWidth: 1040, alignSelf: 'center', paddingHorizontal: spacing.base },
  // App design refresh — white surface card with hairline border, lifts off canvas.
  card: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  cardWide: { paddingHorizontal: spacing.lg, paddingVertical: spacing.base },
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
  reviewText: { ...typography.caption, color: colors.warningDark, marginTop: spacing.sm, lineHeight: 17 },

  loader: { marginTop: spacing.xl },
  empty: { alignItems: 'center', paddingTop: spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.base },
  emptyIconWrap: { marginBottom: spacing.base, alignItems: 'center' as const },
  emptyText: { ...typography.body, color: colors.textSecondary },
  emptyHint: { ...typography.bodySmall, color: colors.textTertiary, marginTop: spacing.xs },
});
