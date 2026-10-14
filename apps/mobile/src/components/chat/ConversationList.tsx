/**
 * D38 Milestone 2: the list of message threads (customer Messages tab,
 * provider Messages screen, and the "choose a pro" step when a request has
 * several threads). Each row: the other person, the service and area, the
 * last message preview, an unread badge, and "Read-only" for a closed
 * thread.
 */
import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View, RefreshControl } from 'react-native';
import type { InboxItem } from '@/services/messaging.service';
import { formatRelative } from '@/utils/date';
import { ErrorState } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Lock, MessageSquare } from '@/components/icons';

export interface ConversationListProps {
  items: InboxItem[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onOpen: (item: InboxItem) => void;
  viewerRole: 'customer' | 'provider';
  refreshing?: boolean;
  onRefresh?: () => void;
  emptyTitle?: string;
  emptyText?: string;
  accent?: string;
}

function rowLabel(item: InboxItem): string {
  const name = item.otherParty?.displayName ?? 'Conversation';
  const unread = item.unreadCount > 0 ? `, ${item.unreadCount} unread` : '';
  const closed = item.state === 'read_only' ? ', read-only' : '';
  return `${name}${unread}${closed}`;
}

export function ConversationList({
  items,
  loading,
  error,
  onRetry,
  onOpen,
  viewerRole,
  refreshing = false,
  onRefresh,
  emptyTitle = 'No messages yet',
  emptyText,
  accent = colors.primary,
}: ConversationListProps): React.ReactElement {
  if (loading && items.length === 0) {
    return (
      <View style={styles.state} accessibilityLabel="Loading conversations">
        <ActivityIndicator size="small" color={accent} />
      </View>
    );
  }
  if (error && items.length === 0) {
    return (
      <ErrorState
        compact
        title="Messages unavailable"
        message="We couldn't load your conversations. Check your connection and try again."
        onRetry={onRetry}
      />
    );
  }

  const fallbackEmpty = viewerRole === 'customer'
    ? 'When a pro sends you a quote, you can message them here.'
    : 'When you send a quote, you can message the customer here.';

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} /> : undefined}
      renderItem={({ item }) => {
        const area = [item.context?.barangay, item.context?.city].filter(Boolean).join(', ');
        const about = [item.service ?? item.context?.serviceName, area].filter(Boolean).join(', ');
        const preview = item.lastMessage
          ? `${item.lastMessage.senderIsMe ? 'You: ' : ''}${item.lastMessage.preview}`
          : 'No messages yet';
        return (
          <TouchableOpacity
            style={styles.row}
            onPress={() => onOpen(item)}
            accessibilityRole="button"
            accessibilityLabel={rowLabel(item)}
          >
            <View style={[styles.avatar, { backgroundColor: item.state === 'read_only' ? colors.backgroundSecondary : colors.primaryLight }]}>
              <Text style={[styles.avatarText, { color: accent }]}>
                {(item.otherParty?.displayName ?? '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.body}>
              <View style={styles.topLine}>
                <Text style={[styles.name, item.unreadCount > 0 && styles.unreadName]} numberOfLines={1}>
                  {item.otherParty?.displayName ?? 'Conversation'}
                </Text>
                {item.lastMessage?.createdAt || item.updatedAt ? (
                  <Text style={styles.time}>{formatRelative(item.lastMessage?.createdAt ?? item.updatedAt)}</Text>
                ) : null}
              </View>
              {about ? <Text style={styles.about} numberOfLines={1}>{about}</Text> : null}
              <View style={styles.bottomLine}>
                <Text style={[styles.preview, item.unreadCount > 0 && styles.unreadPreview]} numberOfLines={1}>{preview}</Text>
                {item.state === 'read_only' ? (
                  <View style={styles.readOnlyTag}>
                    <Lock size={12} color={colors.textSecondary} />
                    <Text style={styles.readOnlyText}>Read-only</Text>
                  </View>
                ) : null}
                {item.unreadCount > 0 ? (
                  <View style={[styles.badge, { backgroundColor: accent }]} accessibilityLabel={`${item.unreadCount} unread`}>
                    <Text style={styles.badgeText}>{item.unreadCount > 99 ? '99+' : String(item.unreadCount)}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </TouchableOpacity>
        );
      }}
      ListEmptyComponent={(
        <View style={styles.empty}>
          <MessageSquare size={44} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text style={styles.emptyText}>{emptyText ?? fallbackEmpty}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.base, gap: spacing.sm, flexGrow: 1 },
  state: { paddingVertical: spacing.xxl, alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { ...typography.h3 },
  body: { flex: 1, minWidth: 0 },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...typography.body, color: colors.text, fontWeight: '600', flex: 1 },
  unreadName: { fontWeight: '800' },
  time: { ...typography.caption, color: colors.textTertiary },
  about: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  bottomLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  preview: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  unreadPreview: { color: colors.text, fontWeight: '600' },
  readOnlyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.backgroundSecondary,
  },
  readOnlyText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { ...typography.caption, color: colors.white, fontWeight: '700' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xxl, gap: spacing.sm, paddingHorizontal: spacing.lg },
  emptyTitle: { ...typography.h3, color: colors.text },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});

export default ConversationList;
