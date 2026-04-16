import React from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

interface RecurringBooking {
  id: string;
  categoryName: string;
  subcategoryName: string | null;
  frequency: string;
  preferredDay: number;
  preferredTime: string;
  status: string;
  servicePrice: number;
  nextScheduledDate: string | null;
  city: string;
  totalCompleted: number;
}

const FREQ_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  bi_weekly: 'Bi-weekly',
  monthly: 'Monthly',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: colors.successLight, text: colors.successDark },
  paused: { bg: colors.warningLight, text: colors.warningDark },
  cancelled: { bg: colors.errorLight, text: colors.error },
};

export default function RecurringListScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['recurring-bookings'],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean;
        data: RecurringBooking[];
        pagination: { total: number };
      }>('/api/v1/recurring');
      return res.data;
    },
  });

  const items = data?.data ?? [];

  const renderItem = ({ item }: { item: RecurringBooking }): React.ReactElement => {
    const statusStyle = STATUS_COLORS[item.status] ?? STATUS_COLORS.active!;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/customer/recurring/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>
            {item.subcategoryName ?? item.categoryName}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </Text>
          </View>
        </View>

        <View style={styles.cardDetails}>
          <Text style={styles.detail}>
            {FREQ_LABELS[item.frequency] ?? item.frequency} &middot; {DAY_NAMES[item.preferredDay]} at {item.preferredTime}
          </Text>
          <Text style={styles.detail}>
            📍 {item.city} &middot; {formatPHP(item.servicePrice)}
          </Text>
          {item.nextScheduledDate && (
            <Text style={styles.nextDate}>
              Next: {new Date(item.nextScheduledDate).toLocaleDateString('en-PH', {
                weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Manila',
              })}
            </Text>
          )}
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.completedCount}>{item.totalCompleted} completed</Text>
          <Text style={styles.arrow}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Recurring Bookings</Text>
      </View>

      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {!isLoading && isError && (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>⚠️</Text>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 8 }}>Something went wrong</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 16 }}>Failed to load recurring bookings. Please try again.</Text>
          <TouchableOpacity onPress={() => void refetch()} style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}>
            <Text style={{ color: colors.white, fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🔄</Text>
          <Text style={styles.emptyTitle}>No recurring bookings</Text>
          <Text style={styles.emptySubtitle}>
            After completing a booking, you can set it to repeat automatically.
          </Text>
        </View>
      )}

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
        }
      />
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
  backBtn: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.base, paddingBottom: 80 },

  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardTitle: { ...typography.h3, color: colors.text, flex: 1, marginRight: spacing.sm },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  statusText: { ...typography.caption, fontWeight: '600' },

  cardDetails: { marginBottom: spacing.sm },
  detail: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: 2 },
  nextDate: { ...typography.bodySmall, color: colors.primary, fontWeight: '600', marginTop: 4 },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.sm,
  },
  completedCount: { ...typography.caption, color: colors.textTertiary },
  arrow: { ...typography.h2, color: colors.textTertiary },

  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.base },
  emptyTitle: { ...typography.h3, color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  emptySubtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
