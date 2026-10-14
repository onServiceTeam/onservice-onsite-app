import React, { useState, useCallback } from 'react';
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
import type { Booking } from '@/services/booking.service';
import { formatPHP } from '@/utils/currency';
import { formatDate } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { useResponsive, byBreakpoint } from '@/hooks/useResponsive';
import { ClipboardList, Filter, Repeat, Hammer } from '@/components/icons';
// A7 — shared UI kit for loading/empty/error states.
import { SkeletonCard, EmptyState, ErrorState } from '@/components/ui';
// Phase 14 Remediation #5 — Bug 889/911/918 (filter chips), Bug 891/916/923
// (pagination loader), Bug 895/901 (status badge) wired here.
import StatusBadge from '@/components/StatusBadge';
import FilterChips from '@/components/FilterChips';
import FilterModal from '@/components/FilterModal';
import PaginationLoader from '@/components/PaginationLoader';

import { buildRoute, Routes } from '@/config/navigation';
type StatusFilter = 'all' | 'active' | 'completed' | 'cancelled';

/** A booking-list row; quote requests also carry the server's request stage (D38). */
type BookingRow = Booking & { requestStage?: string | null; openQuoteCount?: number | null };

/**
 * D38 Milestone 2: what a quote request's card says, from the server's
 * stage (GET /bookings adds requestStage and openQuoteCount to quote rows).
 * Null for ordinary bookings and booked jobs, which keep their status badge.
 */
function requestStageLabel(row: BookingRow): string | null {
  if (row.bookingType !== 'quote_based') return null;
  switch (row.requestStage) {
    case 'waiting': return 'Waiting for a pro';
    case 'no_pros': return 'Looking for pros';
    case 'reopened': return 'Looking for more pros';
    case 'quote_ready': return (row.openQuoteCount ?? 0) > 1 ? `${row.openQuoteCount} quotes ready` : 'Quote ready';
    case 'payment_pending': return 'Pay to confirm';
    case 'closed': return 'Closed';
    default: return null;
  }
}

const OPEN_REQUEST_STATUSES = new Set(['requested', 'quoted']);

const FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

async function fetchBookings({ pageParam = 1, queryKey }: { pageParam?: number; queryKey: string[] }): Promise<{ bookings: Booking[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }> {
  const statusFilter = queryKey[1];
  const sort = queryKey[2];
  const periodDays = queryKey[3];
  const params: Record<string, unknown> = { page: pageParam, pageSize: 15 };
  if (statusFilter && statusFilter !== 'all') params.status = statusFilter;
  if (sort === 'newest' || sort === 'oldest') params.sort = sort;
  if (periodDays === '30' || periodDays === '90') params.periodDays = Number(periodDays);

  const res = await api.get<{
    success: boolean;
    data: Booking[];
    meta: { page: number; pageSize: number; total: number; totalPages: number };
  }>('/api/v1/bookings', { params });

  return { bookings: res.data.data, meta: res.data.meta };
}

export default function BookingsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<StatusFilter>('all');
  // Phase 14 R5-complete — FilterModal for date-range + provider filters.
  const [advancedFiltersVisible, setAdvancedFiltersVisible] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<Record<string, string[]>>({});
  const sortFilter = advancedFilters.sort?.[0] ?? '';
  const periodFilter = advancedFilters.period?.[0] === '30d'
    ? '30'
    : advancedFilters.period?.[0] === '90d'
      ? '90'
      : '';

  const {
    data,
    isLoading,
    isError,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['bookings', filter, sortFilter, periodFilter],
    queryFn: fetchBookings,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.page < lastPage.meta.totalPages) return lastPage.meta.page + 1;
      return undefined;
    },
    staleTime: 60 * 1000,
  });

  const rawBookings = data?.pages.flatMap((p) => p.bookings) ?? [];

  // Sort and period belong in the API query so they apply to the entire history,
  // not just whichever 15-row page the customer has loaded so far.
  const bookings = rawBookings;

  const onRefresh = useCallback(() => { void refetch(); }, [refetch]);

  const { breakpoint, isPhone } = useResponsive();
  const numColumns = byBreakpoint(breakpoint, { phone: 1, tablet: 2, desktop: 2 });

  const renderItem = ({ item }: { item: BookingRow }): React.ReactElement => {
    const stage = requestStageLabel(item);
    const isQuoteRequest = item.bookingType === 'quote_based';
    const isOpenRequest = isQuoteRequest && OPEN_REQUEST_STATUSES.has(item.status);
    // A request has no price until a quote is accepted: never show ₱0.
    const showPrice = !isQuoteRequest || (item.totalAmount ?? 0) > 0;
    const service = item.serviceName ?? item.categoryName ?? 'Service';
    return (
      <TouchableOpacity
        style={[styles.card, numColumns > 1 && styles.cardGrid]}
        onPress={() => router.push(isOpenRequest
          ? { pathname: Routes.CUSTOMER.BOOKING_REQUEST_STATUS, params: { bookingId: item.id } }
          : buildRoute(Routes.CUSTOMER.BOOKING_DETAIL, { id: item.id }))}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={stage ? `Open ${service} request, ${stage}` : `Open ${service} booking`}
      >
        <View style={styles.cardTop}>
          {stage ? (
            <View style={styles.stagePill} accessibilityLabel={`Request: ${stage}`}>
              <Text style={styles.stageText}>{stage}</Text>
            </View>
          ) : (
            /* Phase 14 Remediation #5 — Bug 895/901 status pill via StatusBadge */
            <StatusBadge status={item.status} size="sm" />
          )}
          {/* A request's stored time is a placeholder until a pro's slot is accepted. */}
          <Text style={styles.cardDate}>
            {isOpenRequest ? `Requested ${formatDate(item.createdAt)}` : formatDate(item.scheduledAt)}
          </Text>
        </View>
        <Text style={styles.cardService}>{service}</Text>
        {item.providerName && <Text style={styles.cardProvider}>{item.providerName}</Text>}
        <View style={styles.cardBottom}>
          {showPrice
            ? <Text style={styles.cardPrice}>{formatPHP(item.totalAmount)}</Text>
            : <Text style={styles.cardNoPrice}>{isOpenRequest ? 'Price set by the pro’s quote' : 'No price agreed'}</Text>}
          <Text style={styles.cardArrow}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.base }]}>
      <View style={styles.workspaceHeader}>
      <View style={[styles.titleRow, isPhone && styles.titleRowPhone]}>
        <Text style={styles.title}>Bookings</Text>
        <View style={[styles.quickActions, isPhone && styles.quickActionsPhone]} accessibilityLabel="Booking shortcuts">
          {/* BUG-PHASE53-01 fix — pre-fix the FilterModal below was
               rendered but had no button to open it. Same dead-wire
               pattern as customer search (BUG-PHASE52-01). Now: real
               trigger button alongside the recurring link. */}
          <TouchableOpacity
            style={styles.recurringLink}
            onPress={() => setAdvancedFiltersVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Open booking filters"
          >
            <Filter size={18} color={colors.primary} />
            {Object.values(advancedFilters).flat().length > 0 && (
              <Text style={styles.recurringLinkText}>
                {` (${Object.values(advancedFilters).flat().length})`}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.recurringLink}
            onPress={() => router.push(Routes.CUSTOMER.RECURRING_BOOKINGS)}
            accessibilityRole="button"
            accessibilityLabel="Open recurring bookings"
          >
            <Repeat size={16} color={colors.primary} />
            <Text style={styles.recurringLinkText}> Recurring</Text>
          </TouchableOpacity>
          {/* D27 Phase 5 — entry to the projects layer (big multi-stage jobs). */}
          <TouchableOpacity
            style={styles.recurringLink}
            onPress={() => router.push(Routes.CUSTOMER.PROJECTS)}
            accessibilityRole="button"
            accessibilityLabel="Open projects"
          >
            <Hammer size={16} color={colors.primary} />
            <Text style={styles.recurringLinkText}> Projects</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Phase 14 Remediation #5 — Bug 911/912/913 filter chips via FilterChips */}
      <View accessibilityLabel="Booking status filters">
      <FilterChips
        options={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
        selected={filter}
        onSelect={(v) => setFilter(v as StatusFilter)}
      />
      </View>
      </View>

      {isLoading ? (
        <View style={[styles.list, styles.listFrame]}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : isError ? (
        <ErrorState
          message="We couldn't load your bookings. Please check your connection and try again."
          onRetry={onRefresh}
        />
      ) : (
        <FlatList
          data={bookings}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          key={`bk-${numColumns}`}
          numColumns={numColumns}
          style={styles.listFrame}
          columnWrapperStyle={numColumns > 1 ? styles.gridRow : undefined}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onEndReached={() => { if (hasNextPage) void fetchNextPage(); }}
          onEndReachedThreshold={0.3}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          // Phase 14 Remediation #5 — Bug 891/916/923 pagination loader
          ListFooterComponent={
            <PaginationLoader
              loading={isFetchingNextPage}
              hasMore={!!hasNextPage}
              endLabel="You're all caught up"
            />
          }
          // BUG-PHASE170-01 — the all-filter empty state gets a "Browse
          // Services" CTA (a new customer with zero bookings needs a path
          // forward); filter-specific empties don't (they're about a
          // sub-filter, not the genuine no-history case).
          ListEmptyComponent={
            <EmptyState
              icon={<ClipboardList size={48} color={colors.textTertiary} />}
              title="No bookings yet"
              description={filter === 'all'
                ? 'Your booking history will appear here.'
                : `No ${filter} bookings found.`}
              actionLabel={filter === 'all' ? 'Browse Services' : undefined}
              onAction={filter === 'all' ? () => router.push(Routes.TABS.HOME) : undefined}
            />
          }
        />
      )}
      {/* Phase 14 R5-complete — FilterModal for date-range + sort */}
      <FilterModal
        visible={advancedFiltersVisible}
        title="Sort & Date"
        groups={[
          {
            key: 'sort',
            label: 'Sort by',
            options: [
              { value: 'newest', label: 'Newest first' },
              { value: 'oldest', label: 'Oldest first' },
            ],
          },
          {
            key: 'period',
            label: 'Period',
            options: [
              { value: '30d', label: 'Last 30 days' },
              { value: '90d', label: 'Last 90 days' },
            ],
          },
        ]}
        initialValue={advancedFilters}
        onApply={(selected) => {
          setAdvancedFilters(selected);
          setAdvancedFiltersVisible(false);
        }}
        onClose={() => setAdvancedFiltersVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.base },
  workspaceHeader: { width: '100%', maxWidth: 1280, alignSelf: 'center' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, gap: spacing.md },
  titleRowPhone: { alignItems: 'flex-start', flexDirection: 'column', gap: spacing.xs },
  title: { ...typography.h1, color: colors.text },
  quickActions: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', justifyContent: 'flex-end' },
  quickActionsPhone: { width: '100%', justifyContent: 'flex-start' },
  recurringLink: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  recurringLinkText: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },

  filterRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.base },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.backgroundSecondary,
  },
  filterChipActive: { backgroundColor: colors.primary },
  filterLabel: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '500' },
  filterLabelActive: { color: colors.white },

  listFrame: { width: '100%', maxWidth: 1280, alignSelf: 'center' },
  list: { paddingBottom: 100 },
  gridRow: { gap: spacing.md },
  cardGrid: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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
  cardService: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  cardProvider: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.sm },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardPrice: { ...typography.priceSmall, color: colors.primary },
  cardNoPrice: { ...typography.bodySmall, color: colors.textSecondary },
  stagePill: {
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  stageText: { ...typography.caption, fontWeight: '700', color: colors.primary },
  cardArrow: { fontSize: 22, color: colors.textTertiary },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingVertical: spacing.lg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 64, marginBottom: spacing.base },
  emptyIconWrap: { marginBottom: spacing.base, alignItems: 'center' as const },
  emptyTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.sm },
  emptySubtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  retryButton: { marginTop: spacing.base },
  retryText: { ...typography.body, color: colors.primary, fontWeight: '600' },
});
