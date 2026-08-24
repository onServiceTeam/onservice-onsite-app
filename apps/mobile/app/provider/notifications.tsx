import React, { useCallback } from 'react';
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
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type Notification,
} from '@/services/notification.service';
import { formatRelative } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import type { ComponentType } from 'react';
import {
  ClipboardList, CheckCircle2, PartyPopper, Coins, Scale,
  Star, Gift, Bell, AlertTriangle, MessageSquare, Ban,
  Award, Shield,
} from '@/components/icons';
// A7 — shared UI kit for loading/empty/error states.
import { SkeletonCard, EmptyState, ErrorState } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { getErrorMessage } from '@/utils/errors';
import { useResponsive } from '@/hooks/useResponsive';
import { resolveNotificationRoute } from '@/utils/notification-navigation';

type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

// BUG-PHASE125-01 fix — pre-fix every key in this map (`new_booking`,
// `booking_assigned`, `payment_received`, `dispute_opened`,
// `review_received`, `payout_completed`, `tip_received`) was a stale
// guess that never matched any type emitted by
// packages/api/src/services/notification.service.ts. ALL provider
// notifications fell back to the Bell icon. Replaced with the actual
// API-emitted types the provider receives:
//   - new_job_available — from booking-offer.service.kickOfferCycle
//   - booking_confirmed — from notifyBookingStatusChange (paid)
//   - job_completed — same (completed_by_provider)
//   - payment_released — same (confirmed)
//   - dispute_update — from dispute.service / notifyBookingStatusChange
//   - rating_received — from review.service.createReview (BUG-PHASE125-01)
//   - tier_upgrade / provider_tier_changed — admin actions
//   - nbi_expiring — admin alert
//   - provider_approved / provider_rejected / provider_suspended /
//     provider_reactivated — admin onboarding decisions
//   - customer_cancelled / booking_cancelled — counter-party cancels
//   - new_message / chat_started / chat_last_message — messaging
//   - change_order_expired — auto-expiry worker
//   - recurring_auto_charge_succeeded / failed / suspended — E02 cron
//   - payment — used by tip.service for "Tip Received!" pushes
const NOTIFICATION_ICONS: Record<string, IconComponent> = {
  new_job_available: ClipboardList,
  booking_confirmed: PartyPopper,
  job_completed: CheckCircle2,
  payment_released: Coins,
  // tip.service emits type='payment' for tip received notifications —
  // use the gift icon so they read clearly even though they share the
  // same row 'type' as escrow releases.
  payment: Gift,
  dispute_update: Scale,
  rating_received: Star,
  tier_upgrade: Award,
  provider_tier_changed: Award,
  nbi_expiring: AlertTriangle,
  provider_approved: Shield,
  provider_rejected: Ban,
  provider_suspended: Ban,
  provider_reactivated: Shield,
  customer_cancelled: Ban,
  booking_cancelled: Ban,
  new_message: MessageSquare,
  chat_started: MessageSquare,
  chat_last_message: MessageSquare,
  change_order_expired: AlertTriangle,
  recurring_auto_charge_succeeded: CheckCircle2,
  recurring_auto_charge_failed: AlertTriangle,
  recurring_auto_charge_suspended: AlertTriangle,
  payout: Coins,
  new_job_request: ClipboardList,
  provider_reminder: Bell,
  quality_standing: Shield,
  provider_staff_approved: Shield,
  provider_staff_rejected: Ban,
  provider_certification_verified: Shield,
  provider_certification_unverified: AlertTriangle,
};

export default function ProviderNotificationsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isPhone } = useResponsive();

  const { data, isLoading, isRefetching, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['notifications', 'provider'],
    queryFn: ({ pageParam }) => getNotifications(pageParam, 50),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.notifications.length, 0);
      return loaded < lastPage.total ? pages.length + 1 : undefined;
    },
    staleTime: 30 * 1000,
  });

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['notifications', 'provider'] }); },
    onError: (err: unknown) => {
      showToast(getErrorMessage(err, 'Could not mark notifications as read.'), 'error');
    },
  });

  const onRefresh = useCallback(() => { void refetch(); }, [refetch]);

  const notifications = data?.pages.flatMap((page) => page.notifications) ?? [];
  const unread = data?.pages[0]?.unread ?? 0;

  const handlePress = async (notif: Notification): Promise<void> => {
    try {
      if (!notif.isRead) {
        await markNotificationRead(notif.id);
        void queryClient.invalidateQueries({ queryKey: ['notifications', 'provider'] });
      }
    } catch {
      // Best-effort
    }
    // BUG-PHASE61-01 fix — same pattern as the customer-side fix in
    // Phase 57 (BUG-PHASE57-01). Pre-fix only `bookingId` was
    // followed; non-booking notifications (payout_completed,
    // review_received, tip_received, dispute_opened, etc.) had no
    // destination — provider was left on the notifications list
    // wondering what happened. Now: route by data payload or
    // notification type to job/payouts/reviews/earnings.
    const route = resolveNotificationRoute(notif.type, notif.data, 'provider');
    if (route) router.push(route);
  };

  const renderItem = ({ item }: { item: Notification }): React.ReactElement => {
    const Icon = NOTIFICATION_ICONS[item.type] ?? Bell;
    return (
    <TouchableOpacity
      style={[styles.card, !item.isRead && styles.cardUnread]}
      onPress={() => void handlePress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.iconWrap}><Icon size={22} color={colors.primary} /></View>
      <View style={styles.cardContent}>
        <Text style={[styles.cardTitle, !item.isRead && styles.cardTitleUnread]}>{item.title}</Text>
        <Text style={styles.cardBody} numberOfLines={2}>{item.body}</Text>
        <Text style={styles.cardTime}>{formatRelative(item.createdAt)}</Text>
      </View>
      {!item.isRead && <View style={styles.unreadDot} />}
    </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        {unread > 0 && (
          <TouchableOpacity onPress={() => markAllMutation.mutate()} style={styles.markAllButton} disabled={markAllMutation.isPending}>
            <Text style={styles.markAllText}>{markAllMutation.isPending ? 'Marking…' : 'Mark all read'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.list}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : isError ? (
        <ErrorState
          message="We couldn't load your notifications. Please check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, !isPhone && styles.listWide]}
          accessibilityLabel={!isPhone ? 'Wide provider notification inbox' : undefined}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.secondary} />
          }
          ListEmptyComponent={
            <EmptyState
              icon={<Bell size={48} color={colors.textTertiary} />}
              title="No notifications yet"
              description="Job offers, payment releases, reviews, and tier updates will appear here."
            />
          }
          ListFooterComponent={hasNextPage ? (
            <TouchableOpacity style={styles.loadMoreButton} onPress={() => void fetchNextPage()} disabled={isFetchingNextPage}>
              <Text style={styles.loadMoreText}>{isFetchingNextPage ? 'Loading…' : 'Load earlier notifications'}</Text>
            </TouchableOpacity>
          ) : null}
        />
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text, flex: 1 },
  markAllButton: { padding: spacing.sm },
  markAllText: { ...typography.bodySmall, color: colors.secondary, fontWeight: '600' },

  list: { padding: spacing.base, paddingBottom: 80 },
  listWide: { width: '100%', maxWidth: 920, alignSelf: 'center', padding: spacing.xl },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardUnread: { backgroundColor: colors.successLight, borderColor: colors.success },
  iconWrap: {
    marginRight: spacing.md,
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  emptyIconWrap: { marginBottom: spacing.base },
  icon: { fontSize: 24, marginRight: spacing.md, marginTop: 2 },
  cardContent: { flex: 1 },
  cardTitle: { ...typography.body, color: colors.text },
  cardTitleUnread: { fontWeight: '700' },
  cardBody: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  cardTime: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.secondary,
    marginTop: spacing.sm,
  },
  loadMoreButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  loadMoreText: { ...typography.bodySmall, color: colors.secondary, fontWeight: '700' },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: spacing.base },
  emptyText: { ...typography.body, color: colors.textSecondary },
  // BUG-PHASE178-01 fix — helper text under the notifications empty state.
  emptyHint: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    lineHeight: 20,
  },
});
