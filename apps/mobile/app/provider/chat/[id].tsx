import React from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
//
// D38 Milestone 2: the pro's side of a thread. [id] is the booking id; each
// pro has one thread per booking (their request thread once they quote,
// which carries on as the booking thread if they are booked). The thread
// itself is the shared ChatThread (src/components/chat). Before booking the
// pro sees only the area and service (never the address), from the thread.
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
import { openConversation, type ConversationView } from '@/services/messaging.service';
import { ChatThread } from '@/components/chat/ChatThread';
import { ErrorState, StatusBadge } from '@/components/ui';
import { formatDateTime } from '@/utils/date';
import { apiErrorInfo } from '@/utils/media-errors';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { useResponsive } from '@/hooks/useResponsive';
import { buildRoute, Routes } from '@/config/navigation';

const KEEP_ON_APP_COPY =
  'Keep your conversation here. On-app chat gives support the booking record and helps resolve service issues faster.';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function ProviderChatScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ id: string }>();
  const bookingId = firstParam(params.id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.user?.id);
  const { isPhone } = useResponsive();

  const conversationQuery = useQuery({
    queryKey: ['chat-conversation', bookingId, 'provider'],
    queryFn: () => openConversation({ bookingId: bookingId as string }),
    enabled: !!bookingId,
    retry: false,
    staleTime: 30_000,
  });
  const conversation: ConversationView | undefined = conversationQuery.data;
  const booked = conversation?.stage === 'booking';

  // The booking record (exact address, schedule) is the booked pro's only;
  // a request thread uses the area and service the thread carries.
  const bookingQuery = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBookingById(bookingId as string),
    enabled: !!bookingId && booked,
    staleTime: 5 * 60 * 1000,
  });

  if (!bookingId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ErrorState
          title="Job chat unavailable"
          message="This link does not identify a job. Open chat from the job or request and try again."
          onRetry={() => router.back()}
        />
      </View>
    );
  }

  if (conversationQuery.isError) {
    const info = apiErrorInfo(conversationQuery.error);
    const refused = info.status === 403 || info.code === 'THREADS_DISABLED';
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>
          {refused ? (info.message ?? 'You can message the customer after you send a quote.') : 'Failed to set up chat.'}
        </Text>
        {!refused ? (
          <TouchableOpacity onPress={() => void conversationQuery.refetch()} style={styles.retryButton} accessibilityRole="button" accessibilityLabel="Retry opening job chat">
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={() => router.back()} style={[styles.retryButton, { marginTop: spacing.sm }]} accessibilityRole="button" accessibilityLabel="Go back from unavailable job chat">
          <Text style={[styles.retryText, { color: colors.textSecondary }]}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!conversation) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.secondary} />
        <Text style={styles.loadingText}>Setting up chat...</Text>
      </View>
    );
  }

  const booking = bookingQuery.data;
  const customerName = conversation.otherParty?.displayName ?? booking?.customerName ?? 'Customer';
  const area = [conversation.context?.barangay, conversation.context?.city].filter(Boolean).join(', ');
  const requestAbout = [conversation.context?.serviceName, area].filter(Boolean).join(', ');
  const subtitle = booked ? null : (requestAbout ? `Request: ${requestAbout}` : 'Request');

  // The side panel exists only on tablet and desktop widths.
  const contextPanel = isPhone ? null : (
    <View style={styles.contextPanel} accessibilityLabel="Job conversation context">
      <Text style={styles.contextEyebrow}>{booked ? 'JOB CONTEXT' : 'REQUEST CONTEXT'}</Text>
      {!booked ? (
        <>
          <Text style={styles.contextTitle}>{conversation.context?.serviceName ?? 'Job request'}</Text>
          <View style={styles.contextSection}>
            <Text style={styles.contextLabel}>Customer</Text>
            <Text style={styles.contextValue}>{customerName}</Text>
          </View>
          <View style={styles.contextSection}>
            <Text style={styles.contextLabel}>Area</Text>
            <Text style={styles.contextValue}>{area || 'Shared after booking'}</Text>
          </View>
          <TouchableOpacity
            style={styles.contextAction}
            onPress={() => router.push(buildRoute(Routes.PROVIDER.JOB_QUOTE, { id: bookingId }) as never)}
            accessibilityRole="button"
            accessibilityLabel="Open the request"
          >
            <Text style={styles.contextActionText}>Open the request</Text>
          </TouchableOpacity>
        </>
      ) : booking ? (
        <>
          <Text style={styles.contextTitle}>
            {booking.serviceName ?? booking.categoryName ?? 'Service job'}
          </Text>
          <StatusBadge status={booking.status} size="md" />
          <View style={styles.contextSection}>
            <Text style={styles.contextLabel}>Customer</Text>
            <Text style={styles.contextValue}>{booking.customerName ?? customerName}</Text>
          </View>
          <View style={styles.contextSection}>
            <Text style={styles.contextLabel}>Scheduled</Text>
            <Text style={styles.contextValue}>{booking.scheduledAt ? formatDateTime(booking.scheduledAt) : 'Not scheduled yet'}</Text>
          </View>
          <View style={styles.contextSection}>
            <Text style={styles.contextLabel}>Service location</Text>
            <Text style={styles.contextValue}>
              {[booking.address, booking.barangay, booking.city].filter(Boolean).join(', ')}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.contextAction}
            onPress={() => router.push(buildRoute(Routes.PROVIDER.JOB_DETAIL, { id: bookingId }) as never)}
            accessibilityRole="button"
            accessibilityLabel="Open job details"
          >
            <Text style={styles.contextActionText}>Open job details</Text>
          </TouchableOpacity>
        </>
      ) : bookingQuery.isError ? (
        <View accessibilityRole="alert">
          <Text style={styles.contextUnavailable}>Job context is unavailable. You can still use this conversation.</Text>
          <TouchableOpacity
            style={styles.contextRetry}
            onPress={() => void bookingQuery.refetch()}
            accessibilityRole="button"
            accessibilityLabel="Retry loading job context"
          >
            <Text style={styles.contextRetryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.contextUnavailable}>Loading job context...</Text>
      )}
    </View>
  );

  return (
    <ChatThread
      conversation={conversation}
      viewerId={userId}
      viewerRole="provider"
      accent={colors.secondary}
      title={customerName}
      subtitle={subtitle}
      onBack={() => router.back()}
      backLabel="Go back from customer chat"
      workspaceLabel={isPhone ? 'Provider conversation' : 'Provider conversation workspace'}
      wide={!isPhone}
      keepOnAppCopy={KEEP_ON_APP_COPY}
      inputLabel="Message to customer"
      sendLabel="Send message to customer"
      photoLabel="Send a photo to customer"
      contextPanel={contextPanel}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  centered: { alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md, textAlign: 'center', paddingHorizontal: spacing.lg },
  retryButton: { marginTop: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 44, justifyContent: 'center' as const },
  retryText: { ...typography.body, color: colors.secondary, fontWeight: '600' },
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
  contextRetry: { alignSelf: 'flex-start', marginTop: spacing.sm, minHeight: 44, justifyContent: 'center' },
  contextRetryText: { ...typography.body, color: colors.secondary, fontWeight: '700' },
  contextAction: {
    minHeight: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
  },
  contextActionText: { ...typography.body, color: colors.white, fontWeight: '700' },
});
