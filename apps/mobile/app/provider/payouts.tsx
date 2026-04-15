import React, { useCallback } from 'react';
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
import { formatPHP } from '@/utils/currency';
import { formatDateTime, formatRelative } from '@/utils/date';
import { Badge } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

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

async function getPayouts(page: number, pageSize: number) {
  const res = await api.get<{
    success: boolean;
    data: Payout[];
    pagination: { total: number; page: number; pageSize: number; totalPages: number };
  }>('/api/v1/wallets/payouts', { params: { page, pageSize } });
  return { payouts: res.data.data, ...res.data.pagination };
}

export default function PayoutsScreen() {
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

  const renderItem = ({ item }: { item: Payout }) => (
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Payout History</Text>
      </View>

      {isError ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>⚠️</Text>
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
          ListFooterComponent={
            isFetchingNextPage ? <ActivityIndicator style={styles.loader} color={colors.secondary} /> : null
          }
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator size="large" color={colors.secondary} style={styles.loader} />
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>💸</Text>
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
  backButton: { padding: spacing.sm, marginRight: spacing.sm },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text },

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
  emptyText: { ...typography.body, color: colors.textSecondary },
  emptyHint: { ...typography.bodySmall, color: colors.textTertiary, marginTop: spacing.xs },
});
