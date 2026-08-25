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

const FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

async function fetchBookings({ pageParam = 1, queryKey }: { pageParam?: number; queryKey: string[] }): Promise<{ bookings: Booking[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }> {
  const statusFilter = queryKey[1];
  const params: Record<string, unknown> = { page: pageParam, pageSize: 15 };
  if (statusFilter && statusFilter !== 'all') params.status = statusFilter;

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
    queryKey: ['bookings', filter],
    queryFn: fetchBookings,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.page < lastPage.meta.totalPages) return lastPage.meta.page + 1;
      return undefined;
    },
    staleTime: 60 * 1000,
  });

  const rawBookings = data?.pages.flatMap((p) => p.bookings) ?? [];

  // BUG-PHASE84-01 fix — pre-fix the FilterModal at line 215+ stored
  // advancedFilters in state and showed the count badge, but the
  // bookings list was rendered unfiltered. Same dead-wire pattern
  // as Phase 64-03 for provider jobs. Now the filters are applied
  // client-side (the bookings API doesn't accept sort/period params,
  // so client-side is the only honest place to do the work).
  const bookings = (() => {
    let list = [...rawBookings];
    const period = advancedFilters.period?.[0];
    if (period) {
      const days = period === '30d' ? 30 : period === '90d' ? 90 : period === 'year' ? 365 : 0;
      if (days > 0) {
        const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
        list = list.filter((b) => new Date(b.scheduledAt).getTime() >= cutoffMs);
      }
    }
    const sort = advancedFilters.sort?.[0];
    if (sort === 'oldest') {
      list.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    } else if (sort === 'newest') {
      list.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
    }
    return list;
  })();

  const onRefresh = useCallback(() => { void refetch(); }, [refetch]);

  const { breakpoint, isPhone } = useResponsive();
  const numColumns = byBreakpoint(breakpoint, { phone: 1, tablet: 2, desktop: 2 });

  const renderItem = ({ item }: { item: Booking }): React.ReactElement => (
    <TouchableOpacity
      style={[styles.card, numColumns > 1 && styles.cardGrid]}
      onPress={() => router.push(buildRoute(Routes.CUSTOMER.BOOKING_DETAIL, { id: item.id }))}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.serviceName ?? item.categoryName ?? 'service'} booking`}
    >
      <View style={styles.cardTop}>
        {/* Phase 14 Remediation #5 — Bug 895/901 status pill via StatusBadge */}
        <StatusBadge status={item.status} size="sm" />
        <Text style={styles.cardDate}>{formatDate(item.scheduledAt)}</Text>
      </View>
      <Text style={styles.cardService}>{item.serviceName ?? item.categoryName ?? 'Service'}</Text>
      {item.providerName && <Text style={styles.cardProvider}>{item.providerName}</Text>}
      <View style={styles.cardBottom}>
        <Text style={styles.cardPrice}>{formatPHP(item.totalAmount)}</Text>
        <Text style={styles.cardArrow}>›</Text>
      </View>
    </TouchableOpacity>
  );

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
              { value: 'year', label: 'This year' },
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
