import React, { useState, useCallback } from 'react';
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
import { formatPHP } from '@/utils/currency';
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
      onPress={() => router.push(`/provider/job/${item.id}` as never)}
      activeOpacity={0.7}
    >
      <View style={styles.jobTop}>
        <Badge
          label={item.status.replace(/_/g, ' ').toUpperCase()}
          backgroundColor={getStatusColor(item.status)}
          size="sm"
        />
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
      <Text style={styles.title}>My Jobs</Text>

      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isError ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>⚠️</Text>
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
          ListFooterComponent={
            isFetchingNextPage ? <ActivityIndicator style={styles.loader} color={colors.secondary} /> : null
          }
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator size="large" color={colors.secondary} style={styles.loader} />
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>
                  {filter === 'active' ? '📭' : filter === 'completed' ? '✅' : '🚫'}
                </Text>
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
  emptyText: { ...typography.body, color: colors.textSecondary },
  retryButton: { marginTop: spacing.base },
  retryText: { ...typography.body, color: colors.secondary, fontWeight: '600' },
});
