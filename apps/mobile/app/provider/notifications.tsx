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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type Notification,
} from '@/services/notification.service';
import { formatRelative } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

const NOTIFICATION_ICONS: Record<string, string> = {
  new_booking: '📋',
  booking_assigned: '✅',
  booking_confirmed: '🎉',
  payment_received: '💰',
  dispute_opened: '⚖️',
  review_received: '⭐',
  payout_completed: '💸',
  tip_received: '🎁',
};

export default function ProviderNotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data, isLoading, isRefetching, refetch } = useQuery({
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

  const handlePress = async (notif: Notification) => {
    try {
      if (!notif.isRead) {
        await markNotificationRead(notif.id);
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
    } catch {
      // Best-effort
    }
    const notifData = notif.data as Record<string, string> | null;
    if (notifData?.bookingId) {
      router.push(`/provider/job/${notifData.bookingId}` as never);
    }
  };

  const renderItem = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[styles.card, !item.isRead && styles.cardUnread]}
      onPress={() => void handlePress(item)}
      activeOpacity={0.7}
    >
      <Text style={styles.icon}>{NOTIFICATION_ICONS[item.type] ?? '🔔'}</Text>
      <View style={styles.cardContent}>
        <Text style={[styles.cardTitle, !item.isRead && styles.cardTitleUnread]}>{item.title}</Text>
        <Text style={styles.cardBody} numberOfLines={2}>{item.body}</Text>
        <Text style={styles.cardTime}>{formatRelative(item.createdAt)}</Text>
      </View>
      {!item.isRead && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

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
              <Text style={styles.emptyIcon}>🔔</Text>
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
  backButton: { padding: spacing.sm, marginRight: spacing.sm },
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
  cardUnread: { backgroundColor: '#E6FFF5' },
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
});
