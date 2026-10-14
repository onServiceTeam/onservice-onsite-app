import React from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
//
// D38 Milestone 2: the customer's side of a thread. [id] is the booking id;
// ?provider=<providerUserId> picks one pro's request thread (a booking can
// have one thread per pro who quoted). Without it the booked pro's thread
// opens, so links to booked jobs keep working. The thread itself is the
// shared ChatThread (src/components/chat).
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { getBookingById } from '@/services/booking.service';
import { getInbox, openConversation, type ConversationView } from '@/services/messaging.service';
import { ChatThread } from '@/components/chat/ChatThread';
import { ConversationList } from '@/components/chat/ConversationList';
import { ErrorState, StatusBadge } from '@/components/ui';
import { formatDateTime } from '@/utils/date';
import { apiErrorInfo } from '@/utils/media-errors';
import { customerChatRoute } from '@/utils/chat-routes';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { useResponsive } from '@/hooks/useResponsive';
import { buildRoute, Routes } from '@/config/navigation';

const KEEP_ON_APP_COPY =
  'Keep your conversation here. On-app chat stays attached to the booking so support can review the service record and any dispute evidence.';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function ChatScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ id: string; provider?: string }>();
  const bookingId = firstParam(params.id);
  const providerUserId = firstParam(params.provider);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.user?.id);
  const { isPhone } = useResponsive();

  const conversationQuery = useQuery({
    queryKey: ['chat-conversation', bookingId, providerUserId ?? null],
    queryFn: () => openConversation({ bookingId: bookingId as string, providerUserId }),
    enabled: !!bookingId,
    retry: false,
    staleTime: 30_000,
  });
  const conversation: ConversationView | undefined = conversationQuery.data;
  const errorInfo = conversationQuery.isError ? apiErrorInfo(conversationQuery.error) : null;
  const chooseThread = errorInfo?.code === 'CHOOSE_THREAD';

  // The customer owns the booking, so its details load at either stage.
  const bookingQuery = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBookingById(bookingId as string),
    enabled: !!bookingId,
    staleTime: 5 * 60 * 1000,
  });

  const threadsQuery = useQuery({
    queryKey: ['chat-inbox', 'booking', bookingId],
    queryFn: () => getInbox({ bookingId, state: 'all', pageSize: 50 }),
    enabled: !!bookingId && chooseThread,
  });

  if (!bookingId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ErrorState
          title="Booking chat unavailable"
          message="This link does not identify a booking. Open chat from the booking record and try again."
          onRetry={() => router.back()}
        />
      </View>
    );
  }

  if (chooseThread) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.chooserHeader}>
          <Text style={styles.chooserTitle} accessibilityRole="header">Choose a pro to message</Text>
          <Text style={styles.chooserCopy}>More than one pro sent you a quote for this request. Pick the conversation to open.</Text>
        </View>
        <ConversationList
          items={threadsQuery.data?.items ?? []}
          loading={threadsQuery.isLoading}
          error={threadsQuery.isError}
          onRetry={() => void threadsQuery.refetch()}
          viewerRole="customer"
          onOpen={(item) => router.replace(customerChatRoute(item.bookingId, item.otherParty?.userId) as never)}
        />
      </View>
    );
  }

  if (conversationQuery.isError) {
    // A refusal the server explained (no thread with this pro yet, messages
    // before booking switched off, no pro assigned yet) is shown as it is;
    // anything else gets a retry.
    const notFound = errorInfo?.code === 'THREAD_NOT_FOUND' || errorInfo?.code === 'THREADS_DISABLED'
      || errorInfo?.status === 400 || errorInfo?.status === 403 || errorInfo?.status === 404;
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>
          {notFound
            ? (errorInfo?.message ?? 'There is no conversation with this pro yet.')
            : 'Failed to set up chat.'}
        </Text>
        {!notFound ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry opening booking chat" onPress={() => void conversationQuery.refetch()} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back from unavailable booking chat" onPress={() => router.back()} style={[styles.retryButton, { marginTop: spacing.sm }]}>
          <Text style={[styles.retryText, { color: colors.textSecondary }]}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!conversation) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Setting up chat...</Text>
      </View>
    );
  }

  const booking = bookingQuery.data;
  const providerName = conversation.otherParty?.displayName ?? booking?.providerName ?? 'Your pro';
  const area = [conversation.context?.barangay, conversation.context?.city].filter(Boolean).join(', ');
  const requestAbout = [conversation.context?.serviceName, area].filter(Boolean).join(', ');
  const subtitle = conversation.stage === 'request'
    ? (requestAbout ? `About your request: ${requestAbout}` : 'About your request')
    : null;

  // The side panel exists only on tablet and desktop widths.
  const contextPanel = isPhone ? null : (
    <View style={styles.contextPanel} accessibilityLabel="Booking conversation context">
      <Text style={styles.contextEyebrow}>{conversation.stage === 'request' ? 'REQUEST CONTEXT' : 'BOOKING CONTEXT'}</Text>
      {booking ? (
        <>
          <Text style={styles.contextTitle}>
            {booking.serviceName ?? booking.categoryName ?? conversation.context?.serviceName ?? 'Service booking'}
          </Text>
          <StatusBadge status={booking.status} size="md" />
          {conversation.stage === 'booking' ? (
            <View style={styles.contextSection}>
              <Text style={styles.contextLabel}>Scheduled</Text>
              <Text style={styles.contextValue}>{booking.scheduledAt ? formatDateTime(booking.scheduledAt) : 'Not scheduled yet'}</Text>
            </View>
          ) : null}
          <View style={styles.contextSection}>
            <Text style={styles.contextLabel}>Service location</Text>
            <Text style={styles.contextValue}>
              {[booking.address, booking.barangay, booking.city].filter(Boolean).join(', ')}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.contextAction}
            onPress={() => router.push(buildRoute(Routes.CUSTOMER.BOOKING_DETAIL, { id: bookingId }) as never)}
            accessibilityRole="button"
            accessibilityLabel="Open booking details from chat"
          >
            <Text style={styles.contextActionText}>View booking details</Text>
          </TouchableOpacity>
          {conversation.stage === 'booking' && ['paid', 'provider_en_route', 'provider_arrived', 'in_progress'].includes(booking.status) && (
            <TouchableOpacity
              style={[styles.contextAction, styles.contextActionSecondary]}
              onPress={() => router.push({
                pathname: Routes.CUSTOMER.BOOKING_TRACKER,
                params: { bookingId },
              } as never)}
              accessibilityRole="button"
              accessibilityLabel="Open live job tracker from chat"
            >
              <Text style={styles.contextActionSecondaryText}>Open booking tracker</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <Text style={styles.contextUnavailable}>
          {bookingQuery.isError ? 'Booking context is unavailable. You can still use this conversation.' : 'Loading booking context...'}
        </Text>
      )}
    </View>
  );

  return (
    <ChatThread
      conversation={conversation}
      viewerId={userId}
      viewerRole="customer"
      accent={colors.primary}
      title={providerName}
      subtitle={subtitle}
      onBack={() => router.back()}
      backLabel="Go back from provider chat"
      workspaceLabel={isPhone ? 'Customer conversation' : 'Customer conversation workspace'}
      wide={!isPhone}
      keepOnAppCopy={KEEP_ON_APP_COPY}
      inputLabel="Message to provider"
      sendLabel="Send message"
      photoLabel="Send a photo"
      contextPanel={contextPanel}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  centered: { alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md, textAlign: 'center', paddingHorizontal: spacing.lg },
  retryButton: { marginTop: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 44, justifyContent: 'center' as const },
  retryText: { ...typography.body, color: colors.primary, fontWeight: '600' },
  chooserHeader: { paddingHorizontal: spacing.base, paddingBottom: spacing.md, gap: spacing.xs },
  chooserTitle: { ...typography.h2, color: colors.text },
  chooserCopy: { ...typography.bodySmall, color: colors.textSecondary },
  contextPanel: {
    width: 320,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  contextEyebrow: { ...typography.caption, color: colors.textTertiary, fontWeight: '700', letterSpacing: 0.8 },
  contextTitle: { ...typography.h2, color: colors.text },
  contextSection: { gap: spacing.xs },
  contextLabel: { ...typography.caption, color: colors.textTertiary, fontWeight: '600', textTransform: 'uppercase' },
  contextValue: { ...typography.body, color: colors.text },
  contextUnavailable: { ...typography.body, color: colors.textSecondary },
  contextAction: {
    minHeight: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
  },
  contextActionText: { ...typography.body, color: colors.white, fontWeight: '700' },
  contextActionSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  contextActionSecondaryText: { ...typography.body, color: colors.primary, fontWeight: '700' },
});
