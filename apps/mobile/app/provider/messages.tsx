// D38 Milestone 2: the pro's message threads (reached from the dashboard and
// the Requests header; not a tab, to keep five tabs). One thread per request
// the pro quoted on, carrying on as the job thread when they are booked.
// Closed threads stay readable, marked Read-only.
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatInbox } from '@/hooks/useChatInbox';
import { ConversationList } from '@/components/chat/ConversationList';
import { providerChatRoute } from '@/utils/chat-routes';
import { colors, spacing, typography } from '@/config/theme';
import { ChevronLeft } from '@/components/icons';

export default function ProviderMessagesScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inbox = useChatInbox();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} accessibilityLabel="Provider messages">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back from messages">
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">Messages</Text>
          <Text style={styles.subtitle}>Customers you sent a quote to, and your booked jobs.</Text>
        </View>
      </View>
      <View style={styles.list}>
        <ConversationList
          items={inbox.data?.items ?? []}
          loading={inbox.isLoading}
          error={inbox.isError}
          onRetry={inbox.refetch}
          refreshing={inbox.isRefetching}
          onRefresh={inbox.refetch}
          viewerRole="provider"
          accent={colors.secondary}
          onOpen={(item) => router.push(providerChatRoute(item.bookingId) as never)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.base, paddingVertical: spacing.sm, gap: spacing.sm },
  back: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  headerText: { flex: 1, gap: 2 },
  title: { ...typography.h2, color: colors.text },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary },
  list: { flex: 1 },
});
