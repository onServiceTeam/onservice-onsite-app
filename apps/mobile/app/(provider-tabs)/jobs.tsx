import React, { useState, useCallback } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
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
import { getProviderBookings } from '@/services/provider-api.service';
import type { Booking } from '@/services/booking.service';
import { Filter, MapPin } from '@/components/icons';
// A7 — shared UI kit for loading/empty/error states.
import { SkeletonCard, EmptyState, ErrorState } from '@/components/ui';
import { formatPHP } from '@/utils/currency';
// Phase 14 R5-complete — wire StatusBadge + FilterChips + PaginationLoader
// + PulsingDot + NbiStatusBanner (auto-hides when NBI is valid).
import StatusBadge from '@/components/StatusBadge';
import FilterChips from '@/components/FilterChips';
import FilterModal from '@/components/FilterModal';
import PaginationLoader from '@/components/PaginationLoader';
import PulsingDot from '@/components/PulsingDot';
import NbiStatusBanner from '@/components/provider/NbiStatusBanner';
import { formatRelative, formatDateTime, formatBookingRef } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Routes } from '@/config/navigation';

const STATUS_FILTERS = [
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
] as const;

export default function ProviderJobsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<string>('active');
  // Phase 14 R5-complete — FilterModal for advanced job filters.
  const [advancedFiltersVisible, setAdvancedFiltersVisible] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<Record<string, string[]>>({});

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
    queryKey: ['providerJobs', filter],
    queryFn: ({ pageParam = 1 }) => getProviderBookings(filter, pageParam as number, 15),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const totalPages = Math.ceil(lastPage.total / lastPage.pageSize);
      return lastPage.page < totalPages ? lastPage.page + 1 : undefined;
    },
    staleTime: 30 * 1000,
  });

  const rawJobs = data?.pages.flatMap((p) => p.bookings) ?? [];

  // BUG-PHASE64-03 fix — pre-fix the FilterModal rendered at line 185+
  // had no trigger button anywhere on the screen, so the user could
  // never open it (Phase 14 R5 dead-wire pattern). Even if they could
  // open it, the captured `advancedFilters` state was set into local
  // state and then discarded — never applied to the data. Now: a Filter
  // icon next to the title opens the modal, and the advancedFilters
  // are applied client-side to sort and date-restrict the list (the
  // bookings API doesn't accept sort/period params, so this is the
  // only honest place to do the work).
  const jobs = (() => {
    let list = [...rawJobs];
    const period = advancedFilters.period?.[0];
    if (period) {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 0;
      if (days > 0) {
        const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
        list = list.filter((j) => new Date(j.scheduledAt).getTime() >= cutoffMs);
      }
    }
    const sort = advancedFilters.sort?.[0];
    if (sort === 'oldest') {
      list.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    } else if (sort === 'highest_pay') {
      list.sort((a, b) => b.servicePrice - a.servicePrice);
    } else if (sort === 'newest') {
      list.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
    }
    return list;
  })();

  const advancedFilterCount =
    (advancedFilters.sort?.length ?? 0) + (advancedFilters.period?.length ?? 0);

  const onRefresh = useCallback(() => { void refetch(); }, [refetch]);

  const renderJob = ({ item }: { item: Booking }): React.ReactElement => (
    <TouchableOpacity
      style={styles.jobCard}
      onPress={() => router.push(`/provider/job/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.jobTop}>
        {/* Phase 14 R5-complete — StatusBadge + PulsingDot for live statuses */}
        <StatusBadge status={item.status} size="sm" />
        {(item.status === 'provider_en_route' || item.status === 'provider_arrived') && (
          <PulsingDot />
        )}
        <Text style={styles.jobId}>#{formatBookingRef(item.id, item.createdAt)}</Text>
      </View>
      <Text style={styles.jobService}>{item.serviceName ?? item.categoryName ?? 'Service'}</Text>
      <View style={styles.jobAddressRow}>
        <MapPin size={13} color={colors.textTertiary} />
        <Text style={styles.jobAddress} numberOfLines={1}>
          {[item.address, item.barangay, item.city].filter(Boolean).join(', ')}
        </Text>
      </View>
      <View style={styles.jobBottom}>
        <Text style={styles.jobPrice}>{formatPHP(item.servicePrice)}</Text>
        <Text style={styles.jobDate}>
          {filter === 'active' ? formatRelative(item.scheduledAt) : formatDateTime(item.scheduledAt)}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.base }]}>
      {/* Phase 14 R5-complete — NbiStatusBanner above the jobs list */}
      <NbiStatusBanner onTap={() => router.push(Routes.PROVIDER.ACCOUNT_MANAGEMENT)} />
      <View style={styles.titleRow}>
        <Text style={styles.title}>My Jobs</Text>
        {/* BUG-PHASE64-03 fix — actual trigger for FilterModal. */}
        <TouchableOpacity
          style={styles.advFilterBtn}
          onPress={() => setAdvancedFiltersVisible(true)}
          accessibilityLabel="Sort and date filters"
          testID="provider-jobs-filter-trigger"
        >
          <Filter size={18} color={colors.text} />
          {advancedFilterCount > 0 && (
            <View style={styles.advFilterBadge}>
              <Text style={styles.advFilterBadgeText}>{advancedFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Phase 14 R5-complete — FilterChips replaces inline filter row */}
      <FilterChips
        options={STATUS_FILTERS.map((f) => ({ value: f.key, label: f.label }))}
        selected={filter}
        onSelect={(v) => setFilter(v as typeof filter)}
      />

      {isError ? (
        <ErrorState
          message="We couldn't load your jobs. Please check your connection and try again."
          onRetry={onRefresh}
        />
      ) : (
        <FlatList
          data={jobs}
          renderItem={renderJob}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.secondary} />
          }
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          onEndReachedThreshold={0.3}
          // Phase 14 R5-complete — PaginationLoader (loading + end-of-list label)
          ListFooterComponent={
            <PaginationLoader
              loading={isFetchingNextPage}
              hasMore={!!hasNextPage}
              endLabel="No more jobs"
            />
          }
          // BUG-PHASE175-01 — each empty state carries helper text so a
          // provider understands why the list is empty (be online, etc.).
          ListEmptyComponent={
            isLoading ? (
              <View style={styles.list}>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </View>
            ) : (
              <EmptyState
                icon={filter === 'completed' ? '✅' : filter === 'cancelled' ? '🚫' : '📭'}
                title={filter === 'active'
                  ? 'No active jobs'
                  : filter === 'completed'
                    ? 'No completed jobs yet'
                    : 'No cancelled jobs'}
                description={filter === 'active'
                  ? "Make sure you're online (toggle on the Dashboard) and have services configured. New job requests will appear here."
                  : filter === 'completed'
                    ? 'Completed jobs will show here after the customer confirms or after the auto-confirm window passes.'
                    : 'Cancelled jobs will appear here.'}
              />
            )
          }
        />
      )}
      {/* Phase 14 R5-complete — FilterModal for date-range / sort filters */}
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
              { value: 'highest_pay', label: 'Highest pay' },
            ],
          },
          {
            key: 'period',
            label: 'Period',
            options: [
              { value: '7d', label: 'Last 7 days' },
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
  titleRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: spacing.md,
  },
  title: { ...typography.h1, color: colors.text },
  advFilterBtn: {
    padding: spacing.sm,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    position: 'relative' as const,
  },
  advFilterBadge: {
    position: 'absolute' as const,
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.secondary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 4,
  },
  advFilterBadgeText: { fontSize: 10, fontWeight: '700' as const, color: colors.white },

  filterRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  filterChip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.backgroundSecondary,
  },
  filterChipActive: { backgroundColor: colors.secondary },
  filterText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  filterTextActive: { color: colors.white },

  list: { paddingBottom: 100 },
  jobCard: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  jobTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  jobId: { ...typography.caption, color: colors.textTertiary, fontWeight: '600' },
  jobService: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  jobAddressRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.sm },
  jobAddress: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  jobBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  jobPrice: { ...typography.priceSmall, color: colors.secondary },
  jobDate: { ...typography.caption, color: colors.textTertiary },

  loader: { marginTop: spacing.xl },
  empty: { alignItems: 'center', paddingTop: spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.base },
  emptyIconImg: { marginBottom: spacing.base },
  emptyText: { ...typography.body, color: colors.textSecondary },
  // BUG-PHASE175-01 fix — helper text under the empty-state title.
  emptyHint: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    lineHeight: 20,
  },
  retryButton: { marginTop: spacing.base },
  retryText: { ...typography.body, color: colors.secondary, fontWeight: '600' },
});
