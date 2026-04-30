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
import api from '@/services/api';
import type { Booking } from '@/services/booking.service';
import { Badge } from '@/components/ui';
import { formatPHP } from '@/utils/currency';
import { formatDate } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { AlertTriangle, ClipboardList } from '@/components/icons';

import { Routes } from '@/config/navigation';
type StatusFilter = 'all' | 'active' | 'completed' | 'cancelled';

const FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    requested: colors.statusPending,
    quoted: colors.statusPending,
    matched: colors.statusConfirmed,
    payment_pending: colors.statusPending,
    paid: colors.statusConfirmed,
    provider_en_route: colors.statusInProgress,
    provider_arrived: colors.statusInProgress,
    in_progress: colors.statusInProgress,
    completed_by_provider: colors.statusCompleted,
    confirmed: colors.statusCompleted,
    payout_ready: colors.statusCompleted,
    paid_out: colors.statusCompleted,
    disputed: colors.statusDisputed,
    resolved: colors.statusCompleted,
    cancelled_by_customer: colors.statusCancelled,
    cancelled_by_provider: colors.statusCancelled,
    cancelled_by_admin: colors.statusCancelled,
  };
  return map[status] ?? colors.textTertiary;
}

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

  const bookings = data?.pages.flatMap((p) => p.bookings) ?? [];

  const onRefresh = useCallback(() => { void refetch(); }, [refetch]);

  const renderItem = ({ item }: { item: Booking }): React.ReactElement => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/customer/booking/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.cardTop}>
        <Badge
          label={item.status.replace(/_/g, ' ').toUpperCase()}
          backgroundColor={getStatusColor(item.status)}
        />
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
      <View style={styles.titleRow}>
        <Text style={styles.title}>Bookings</Text>
        <TouchableOpacity
          style={styles.recurringLink}
          onPress={() => router.push(Routes.CUSTOMER.RECURRING_BOOKINGS)}
        >
          <Text style={styles.recurringLinkText}>🔄 Recurring</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterChip, filter === f.value && styles.filterChipActive]}
            onPress={() => setFilter(f.value)}
          >
            <Text style={[styles.filterLabel, filter === f.value && styles.filterLabelActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isError ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}><AlertTriangle size={48} color={colors.error} /></View>
          <Text style={styles.emptyTitle}>Something went wrong</Text>
          <Text style={styles.emptySubtitle}>Could not load your bookings.</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.retryButton}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={bookings}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
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
          ListFooterComponent={isFetchingNextPage ? (
            <ActivityIndicator size="small" color={colors.primary} style={styles.footer} />
          ) : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}><ClipboardList size={48} color={colors.textTertiary} /></View>
              <Text style={styles.emptyTitle}>No bookings yet</Text>
              <Text style={styles.emptySubtitle}>
                {filter === 'all'
                  ? 'Your booking history will appear here.'
                  : `No ${filter} bookings found.`}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.base },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { ...typography.h1, color: colors.text },
  recurringLink: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
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

  list: { paddingBottom: 100 },
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
