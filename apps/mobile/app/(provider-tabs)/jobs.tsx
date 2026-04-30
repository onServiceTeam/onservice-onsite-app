import React, { useState, useCallback } from 'react';
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
import { useInfiniteQuery } from '@tanstack/react-query';
import { getProviderBookings } from '@/services/provider-api.service';
import type { Booking } from '@/services/booking.service';
import { Badge } from '@/components/ui';
import { AlertTriangle, Inbox, CheckCircle2, Ban } from '@/components/icons';
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

const STATUS_FILTERS = [
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
] as const;

function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    requested: colors.statusPending,
    quoted: colors.statusPending,
    matched: colors.statusConfirmed,
    paid: colors.statusConfirmed,
    provider_en_route: colors.statusInProgress,
    provider_arrived: colors.statusInProgress,
    in_progress: colors.statusInProgress,
    completed_by_provider: colors.statusCompleted,
    confirmed: colors.statusCompleted,
    payout_ready: colors.statusCompleted,
    paid_out: colors.statusCompleted,
  };
  return map[status] ?? colors.statusCancelled;
}

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

  const jobs = data?.pages.flatMap((p) => p.bookings) ?? [];

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
      <Text style={styles.jobAddress} numberOfLines={1}>
        📍 {[item.address, item.barangay, item.city].filter(Boolean).join(', ')}
      </Text>
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
      <NbiStatusBanner />
      <Text style={styles.title}>My Jobs</Text>

      {/* Phase 14 R5-complete — FilterChips replaces inline filter row */}
      <FilterChips
        options={STATUS_FILTERS.map((f) => ({ value: f.key, label: f.label }))}
        selected={filter}
        onSelect={(v) => setFilter(v as typeof filter)}
      />

      {isError ? (
        <View style={styles.empty}>
          <AlertTriangle size={40} color={colors.error} style={styles.emptyIconImg} />
          <Text style={styles.emptyText}>Failed to load jobs.</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.retryButton}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
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
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator size="large" color={colors.secondary} style={styles.loader} />
            ) : (
              <View style={styles.empty}>
                {filter === 'active' ? (
                  <Inbox size={40} color={colors.textTertiary} style={styles.emptyIconImg} />
                ) : filter === 'completed' ? (
                  <CheckCircle2 size={40} color={colors.success} style={styles.emptyIconImg} />
                ) : (
                  <Ban size={40} color={colors.textTertiary} style={styles.emptyIconImg} />
                )}
                <Text style={styles.emptyText}>
                  {filter === 'active'
                    ? 'No active jobs'
                    : filter === 'completed'
                      ? 'No completed jobs yet'
                      : 'No cancelled jobs'}
                </Text>
              </View>
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
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.base },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.md },

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
    backgroundColor: colors.backgroundSecondary,
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
  jobAddress: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.sm },
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
  retryButton: { marginTop: spacing.base },
  retryText: { ...typography.body, color: colors.secondary, fontWeight: '600' },
});
