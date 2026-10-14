// D38 Milestone 2: the customer's Messages tab. One thread per pro: each
// pro who sends a quote can be messaged before booking, and the booked pro's
// thread carries on after. Closed threads stay readable, marked Read-only.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatInbox } from '@/hooks/useChatInbox';
import { ConversationList } from '@/components/chat/ConversationList';
import { customerChatRoute } from '@/utils/chat-routes';
import { colors, spacing, typography } from '@/config/theme';

export default function CustomerMessagesScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inbox = useChatInbox();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} accessibilityLabel="Customer messages">
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">Messages</Text>
        <Text style={styles.subtitle}>Talk with the pros who quoted on your requests. Chats kept here give support the record if you need help.</Text>
      </View>
      <View style={styles.list}>
        <ConversationList
          items={inbox.data?.items ?? []}
          loading={inbox.isLoading}
          error={inbox.isError}
          onRetry={inbox.refetch}
          refreshing={inbox.isRefetching}
          onRefresh={inbox.refetch}
          viewerRole="customer"
          onOpen={(item) => router.push(customerChatRoute(
            item.bookingId,
            item.otherParty?.role === 'provider' ? item.otherParty.userId : null,
          ) as never)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.xs },
  title: { ...typography.h1, color: colors.text },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary },
  list: { flex: 1 },
});
