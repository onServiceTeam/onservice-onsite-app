import React, { useCallback } from 'react';
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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
};

export default function ProviderNotificationsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data, isLoading, isRefetching, isError, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotifications(1, 50),
    staleTime: 30 * 1000,
  });

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['notifications'] }); },
  });

  const onRefresh = useCallback(() => { void refetch(); }, [refetch]);

  const notifications = data?.notifications ?? [];
  const unread = data?.unread ?? 0;

  const handlePress = async (notif: Notification): Promise<void> => {
    try {
      if (!notif.isRead) {
        await markNotificationRead(notif.id);
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
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
    const notifData = notif.data as Record<string, string> | null;
    // BUG-PHASE100-01 fix — same chat-routing fix as the customer
    // side. Chat-related notifications (new_message, chat_last_message,
    // chat_started) include bookingId, but routing them to the job
    // detail dumped the provider on the wrong screen and forced them
    // to tap "Chat with Customer" before reading the message that
    // just buzzed. Short-circuit to /provider/chat/[bookingId].
    if (
      (notif.type === 'new_message'
        || notif.type === 'chat_last_message'
        || notif.type === 'chat_started')
      && notifData?.bookingId
    ) {
      router.push(`/provider/chat/${notifData.bookingId}`);
    } else if (notifData?.bookingId) {
      router.push(`/provider/job/${notifData.bookingId}`);
    } else if (notif.type === 'rating_received') {
      // BUG-PHASE125-01 fix — pre-fix this branch keyed on
      // `review_received` which the API never emits, so the route
      // was dead.
      router.push('/provider/reviews');
    } else if (notif.type === 'payment' || notif.type === 'payment_released') {
      // BUG-PHASE125-01 fix — pre-fix branched on `tip_received`
      // and `payment_received` which the API never emits. tip.service
      // writes notifications with type='payment'; payment_released
      // is the canonical escrow release type per
      // notification.service's statusToType map. Both land on
      // earnings so the provider can see the credit.
      router.push('/(provider-tabs)/earnings');
    } else if (notif.type === 'tier_upgrade' || notif.type === 'provider_tier_changed') {
      router.push('/provider/tier-progression');
    } else if (notif.type === 'nbi_expiring') {
      router.push('/provider/account-management');
    }
    // Else: just stays on the notifications list (already marked read).
  };

  const renderItem = ({ item }: { item: Notification }): React.ReactElement => {
    const Icon = NOTIFICATION_ICONS[item.type] ?? Bell;
    return (
    <TouchableOpacity
      style={[styles.card, !item.isRead && styles.cardUnread]}
      onPress={() => void handlePress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.iconWrap}><Icon size={22} color={colors.secondary} /></View>
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
          <TouchableOpacity onPress={() => markAllMutation.mutate()} style={styles.markAllButton}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.secondary} />
        </View>
      ) : isError ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ marginBottom: 12 }}><AlertTriangle size={48} color={colors.error} /></View>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 8 }}>Something went wrong</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 16 }}>Failed to load notifications. Please try again.</Text>
          <TouchableOpacity onPress={() => void refetch()} style={{ backgroundColor: colors.secondary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}>
            <Text style={{ color: colors.white, fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.secondary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}><Bell size={48} color={colors.textTertiary} /></View>
              <Text style={styles.emptyText}>No notifications yet</Text>
              {/* BUG-PHASE178-01 fix — pre-fix the empty state was bare.
                  Same UX-gap family as Phase 169-177. Now: a one-line
                  hint that explains what arrives here. */}
              <Text style={styles.emptyHint}>
                Job offers, payment releases, reviews, and tier updates will appear here.
              </Text>
            </View>
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
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text, flex: 1 },
  markAllButton: { padding: spacing.sm },
  markAllText: { ...typography.bodySmall, color: colors.secondary, fontWeight: '600' },

  list: { padding: spacing.base, paddingBottom: 80 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  cardUnread: { backgroundColor: colors.successLight },
  iconWrap: { marginRight: spacing.md, marginTop: 2, width: 28, alignItems: 'center' as const },
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
