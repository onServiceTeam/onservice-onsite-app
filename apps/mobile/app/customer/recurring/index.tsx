import React from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { useResponsive, byBreakpoint } from '@/hooks/useResponsive';
import { MapPin, ChevronRight, Repeat } from '@/components/icons';
// A7 — shared UI kit for loading/empty/error states.
import { SkeletonCard, EmptyState, ErrorState } from '@/components/ui';
import { Routes } from '@/config/navigation';

interface RecurringBooking {
  id: string;
  categoryName: string;
  subcategoryName: string | null;
  frequency: string;
  preferredDay: number;
  preferredTime: string;
  status: string;
  servicePrice: number;
  serviceFee: number;
  totalAmount: number;
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

  const { breakpoint } = useResponsive();
  const numColumns = byBreakpoint(breakpoint, { phone: 1, tablet: 2, desktop: 3 });

  const renderItem = ({ item }: { item: RecurringBooking }): React.ReactElement => {
    const statusStyle = STATUS_COLORS[item.status] ?? STATUS_COLORS.active!;
    return (
      <TouchableOpacity
        style={[styles.card, numColumns > 1 && styles.cardGrid]}
        onPress={() => router.push(`/customer/recurring/${item.id}`)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.subcategoryName ?? item.categoryName} recurring booking`}
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
            {/* BUG-PHASE49-01 fix — pre-fix `DAY_NAMES[item.preferredDay]`
                returned undefined for null/undefined or out-of-range
                values (e.g. legacy rows with NULL preferred_day_of_week
                pre-migration 042). The undefined rendered as nothing,
                making the line read "Weekly · at 09:00" with an empty
                spot. Now: explicit '—' fallback. */}
            {FREQ_LABELS[item.frequency] ?? item.frequency} &middot; {DAY_NAMES[item.preferredDay] ?? '—'} at {item.preferredTime ?? '—'}
          </Text>
          <View style={styles.detailRow}>
            <MapPin size={12} color={colors.textSecondary} />
            <Text style={styles.detail}>{item.city}</Text>
          </View>
          <Text style={styles.priceLine}>{formatPHP(item.totalAmount)} per visit, including fee</Text>
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
          <ChevronRight size={18} color={colors.textTertiary} />
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

      {isLoading ? (
        <View style={styles.list}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : isError ? (
        <ErrorState
          message="We couldn't load your recurring bookings. Please check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : (
        <View
          style={styles.listFrame}
          accessibilityLabel={numColumns > 1 ? 'Tablet and desktop recurring booking grid' : 'Recurring booking list'}
        >
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          key={`recurring-${numColumns}`}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? styles.gridRow : undefined}
          contentContainerStyle={[styles.list, numColumns > 1 && styles.listWide]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
          // BUG-PHASE173-01 — empty state has a "Browse Services" CTA so a
          // customer with no recurring bookings has a path forward.
          ListEmptyComponent={
            <EmptyState
              icon={<Repeat size={48} color={colors.textTertiary} />}
              title="No recurring bookings"
              description="After completing a booking, you can set it to repeat automatically."
              actionLabel="Browse Services"
              onAction={() => router.push(Routes.TABS.HOME)}
            />
          }
        />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listFrame: { flex: 1 },
  list: { padding: spacing.base, paddingBottom: 80 },
  listWide: { width: '100%', maxWidth: 1200, alignSelf: 'center', padding: spacing.xl },
  gridRow: { gap: spacing.md },
  cardGrid: { flex: 1 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
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
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  detail: { ...typography.bodySmall, color: colors.textSecondary },
  priceLine: { ...typography.bodySmall, color: colors.text, fontWeight: '700', marginTop: spacing.xs },
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
  emptyIcon: { marginBottom: spacing.base },
  emptyTitle: { ...typography.h3, color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  emptySubtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  // BUG-PHASE173-01 fix styles for the Browse Services CTA.
  emptyCta: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    minHeight: 44,
    justifyContent: 'center' as const,
  },
  emptyCtaText: { color: colors.white, fontWeight: '600', fontSize: 14 },
});
