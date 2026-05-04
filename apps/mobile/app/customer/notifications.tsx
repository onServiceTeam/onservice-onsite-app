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
  CheckCircle2, User, Car, MapPin, PartyPopper, Coins, Scale,
  Star, Gift, Bell, AlertTriangle,
} from '@/components/icons';

type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

const NOTIFICATION_ICONS: Record<string, IconComponent> = {
  booking_confirmed: CheckCircle2,
  provider_assigned: User,
  provider_en_route: Car,
  provider_arrived: MapPin,
  job_completed: PartyPopper,
  payment_released: Coins,
  dispute_update: Scale,
  review_received: Star,
  promo: Gift,
};

export default function NotificationsScreen(): React.ReactElement {
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

  const handleNotificationPress = async (notif: Notification): Promise<void> => {
    try {
      if (!notif.isRead) {
        await markNotificationRead(notif.id);
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
    } catch {
      // Best-effort mark as read; don't block navigation
    }
    // BUG-PHASE57-01 fix — pre-fix only `bookingId` was followed for
    // navigation. Non-booking notifications (dispute updates, payout
    // status, provider tier changes, suki rewards, promo codes,
    // referral credits) had no destination — tapping them only
    // marked them read with no further action. Now: route to the
    // most specific destination available based on the data payload.
    const notifData = notif.data as Record<string, string> | null;
    if (notifData?.bookingId) {
      router.push(`/customer/booking/${notifData.bookingId}`);
    } else if (notifData?.disputeId && notifData?.bookingId === undefined) {
      // Disputes always tied to a booking server-side, but if the
      // notification data only has disputeId, fall through to
      // bookings tab so the customer can find it.
      router.push('/(tabs)/bookings');
    } else if (notifData?.providerId) {
      router.push(`/customer/provider/${notifData.providerId}`);
    } else if (notif.type === 'promo' || notif.type === 'referral') {
      router.push('/customer/referral');
    } else if (notif.type === 'review_received' || notif.type === 'job_completed') {
      router.push('/(tabs)/bookings');
    } else if (notif.type === 'payment_released') {
      router.push('/(tabs)/wallet');
    }
    // Else: no nav, just stays on notifications list (already marked read).
  };

  const renderItem = ({ item }: { item: Notification }): React.ReactElement => {
    const Icon = NOTIFICATION_ICONS[item.type] ?? Bell;
    return (
    <TouchableOpacity
      style={[styles.card, !item.isRead && styles.cardUnread]}
      onPress={() => void handleNotificationPress(item)}
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
          <TouchableOpacity onPress={() => markAllMutation.mutate()} style={styles.markAllButton}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isError ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ marginBottom: 12 }}><AlertTriangle size={48} color={colors.error} /></View>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 8 }}>Something went wrong</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 16 }}>Failed to load notifications. Please try again.</Text>
          <TouchableOpacity onPress={() => void refetch()} style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}>
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
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}><Bell size={48} color={colors.textTertiary} /></View>
              <Text style={styles.emptyText}>No notifications yet</Text>
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
  markAllText: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },

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
  cardUnread: { backgroundColor: colors.primaryLight },
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
    backgroundColor: colors.primary,
    marginTop: spacing.sm,
  },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: spacing.base },
  emptyText: { ...typography.body, color: colors.textSecondary },
});
