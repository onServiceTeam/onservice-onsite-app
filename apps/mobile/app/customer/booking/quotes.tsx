import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
//
// D38 Milestone 2 (package P5b): the quotes on the customer's request. With
// the default setting (one open quote per request) this shows the single
// quote from the first pro who responded. Accept and book opens the confirm
// screen (nothing is accepted here). Decline asks for a reason; what happens
// next comes from the server's answer (the request goes back to other pros,
// or on the last allowed round the back office is asked), so the screen
// promises neither before the choice. Message opens the thread with that pro.
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  declineQuote,
  getBookingQuotes,
  type DeclineReason,
  type QuoteDeclineResult,
  type RequestQuote,
} from '@/services/request.service';
import { colors, spacing, borderRadius, typography } from '@/config/theme';
import { ChevronLeft, Clock } from '@/components/icons';
import { useResponsive } from '@/hooks/useResponsive';
import { SkeletonCard, EmptyState, ErrorState } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { getErrorMessage } from '@/utils/errors';
import { customerChatRoute } from '@/utils/chat-routes';
import { Routes } from '@/config/navigation';
import { REALTIME_EVENTS } from '@/config/realtime-events';
import { QuoteCard, isQuoteLive } from '@/components/booking/QuoteCard';
import { DeclineReasonSheet } from '@/components/booking/DeclineReasonSheet';
import { useSocketEvent } from '@/hooks/useSocketEvent';
import { usePollWhileFocused } from '@/hooks/usePollWhileFocused';
import { useRequestConfig } from '@/hooks/useRequestConfig';
import { CUSTOMER_REQUEST_SUMMARY_KEY } from '@/hooks/useCustomerRequestSummary';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** What happens next after a decline, from the server's answer. */
function declineOutcomeCopy(result: Pick<QuoteDeclineResult, 'reopened' | 'opsReview'>): string {
  if (result.reopened) return 'Quote declined. We let the pro know, and your request is open to other pros again.';
  if (result.opsReview) return 'Quote declined. We let the pro know. Our team is now looking for more pros and may contact you.';
  return 'Quote declined. We let the pro know.';
}

export default function QuotesScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ bookingId: string }>();
  const bookingId = firstParam(params?.bookingId);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isPhone } = useResponsive();
  const config = useRequestConfig();
  const [declining, setDeclining] = useState<RequestQuote | null>(null);

  const refetchInterval = usePollWhileFocused({
    connectedMs: false,
    disconnectedMs: config.requestProviderPollSeconds * 1000,
    enabled: !!bookingId,
  });
  const { data: quotes, isLoading, isError, refetch } = useQuery({
    queryKey: ['bookingQuotes', bookingId],
    queryFn: () => getBookingQuotes(bookingId ?? ''),
    enabled: !!bookingId,
    refetchInterval,
  });

  const refreshForBooking = (payload: { bookingId?: string } | null | undefined): void => {
    if (payload?.bookingId && payload.bookingId !== bookingId) return;
    void queryClient.invalidateQueries({ queryKey: ['bookingQuotes', bookingId] });
  };
  useSocketEvent<{ bookingId?: string }>(bookingId ? REALTIME_EVENTS.QUOTE_RECEIVED : null, refreshForBooking);
  useSocketEvent<{ bookingId?: string }>(bookingId ? REALTIME_EVENTS.REQUEST_UPDATED : null, refreshForBooking);

  const declineMutation = useMutation({
    mutationFn: (input: { quoteId: string; reason: DeclineReason; note?: string }) =>
      declineQuote(bookingId ?? '', input.quoteId, { reason: input.reason, note: input.note }),
    onSuccess: (result) => {
      setDeclining(null);
      void queryClient.invalidateQueries({ queryKey: ['bookingQuotes', bookingId] });
      void queryClient.invalidateQueries({ queryKey: ['request-status', bookingId] });
      void queryClient.invalidateQueries({ queryKey: ['booking', bookingId] });
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      void queryClient.invalidateQueries({ queryKey: CUSTOMER_REQUEST_SUMMARY_KEY });
      showToast(declineOutcomeCopy(result), 'success');
      // No quote left to decide on: the request status screen says what happens next.
      if (result.bookingStatus === 'requested') {
        router.replace({ pathname: Routes.CUSTOMER.BOOKING_REQUEST_STATUS, params: { bookingId: bookingId ?? '' } });
      }
    },
    onError: (err: unknown) => {
      showToast(getErrorMessage(err, 'Could not decline this quote. Check your connection and try again.'), 'error');
      void refetch();
    },
  });

  const header = (title: string): React.ReactElement => (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.backBtn}
        accessibilityRole="button"
        accessibilityLabel="Back from quotes"
      >
        <ChevronLeft size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} accessibilityRole="header">{title}</Text>
      <View style={styles.placeholder} />
    </View>
  );

  if (!bookingId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header('Quotes')}
        <EmptyState
          title="Quote request unavailable"
          description="Open quotes from one of your requests so each pro's quote stays attached to the right job."
          actionLabel="View bookings"
          onAction={() => router.replace(Routes.TABS.BOOKINGS)}
        />
      </SafeAreaView>
    );
  }

  const all = quotes ?? [];
  const live = all.filter((quote) => isQuoteLive(quote));
  const earlier = all.filter((quote) => !isQuoteLive(quote));
  const title = live.length === 1 ? 'Your quote' : live.length > 1 ? 'Your quotes' : 'Quotes';
  const openStatus = (): void => {
    router.push({ pathname: Routes.CUSTOMER.BOOKING_REQUEST_STATUS, params: { bookingId } });
  };

  const card = (quote: RequestQuote): React.ReactElement => {
    const canMessage = !!quote.providerUserId
      && (!!quote.conversationId || (isQuoteLive(quote) && config.requestThreadsEnabled));
    return (
      <QuoteCard
        quote={quote}
        busy={declineMutation.isPending}
        onAccept={() => router.push({
          pathname: Routes.CUSTOMER.BOOKING_CONFIRM_QUOTE,
          params: { bookingId, quoteId: quote.id },
        })}
        onDecline={() => setDeclining(quote)}
        onMessage={canMessage ? () => router.push(customerChatRoute(bookingId, quote.providerUserId)) : undefined}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {header(title)}
      {isLoading ? (
        <View style={styles.bodyContent}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : isError ? (
        <ErrorState
          message="We couldn't load the quotes. Please check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : (
        <ScrollView
          style={styles.body}
          contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}
        >
          {all.length === 0 ? (
            <EmptyState
              icon={<Clock size={48} color={colors.textTertiary} />}
              title="No quotes yet"
              description="Quotes appear here as soon as a pro responds. We also add them to your notifications."
              actionLabel="See request status"
              onAction={openStatus}
            />
          ) : null}
          {all.length > 0 && live.length === 0 ? (
            <View style={styles.notice} accessibilityRole="text">
              <Text style={styles.noticeText}>No quote is waiting for your answer right now.</Text>
              <TouchableOpacity onPress={openStatus} style={styles.noticeLink} accessibilityRole="button">
                <Text style={styles.noticeLinkText}>See request status</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {live.length > 0 ? (
            <>
              <Text style={styles.intro}>
                {live.length === 1
                  ? 'This pro responded to your request. Accept and book to see the full total and confirm, or decline it and tell us why.'
                  : 'Compare the quotes. Accept and book shows the full total before you confirm.'}
              </Text>
              <View
                style={[styles.quoteGrid, !isPhone && live.length > 1 && styles.quoteGridWide]}
                accessibilityLabel={isPhone ? 'Quote list' : 'Quote comparison grid'}
              >
                {live.map((quote) => (
                  <View key={quote.id} style={[styles.quoteCell, !isPhone && live.length > 1 && styles.quoteCellWide]}>
                    {card(quote)}
                  </View>
                ))}
              </View>
            </>
          ) : null}
          {earlier.length > 0 ? (
            <View style={styles.earlier}>
              <Text style={styles.earlierTitle}>Earlier quotes</Text>
              {earlier.map((quote) => (
                <View key={quote.id}>{card(quote)}</View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
      <DeclineReasonSheet
        visible={declining !== null}
        providerName={declining?.provider?.name ?? null}
        loading={declineMutation.isPending}
        onSubmit={(input) => {
          if (declining) declineMutation.mutate({ quoteId: declining.id, ...input });
        }}
        onCancel={() => setDeclining(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  placeholder: { width: 44 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  bodyContentWide: { padding: spacing.xl, paddingBottom: spacing.xl, width: '100%', maxWidth: 1180, alignSelf: 'center' },
  intro: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.base },
  quoteGrid: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  quoteGridWide: { maxWidth: undefined, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.base },
  quoteCell: { width: '100%' },
  quoteCellWide: { flexBasis: '48%', flexGrow: 1, minWidth: 300 },
  notice: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.base, marginBottom: spacing.base, gap: spacing.xs },
  noticeText: { ...typography.body, color: colors.text },
  noticeLink: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  noticeLinkText: { ...typography.bodySmall, fontWeight: '700', color: colors.primary },
  earlier: { marginTop: spacing.lg, width: '100%', maxWidth: 640, alignSelf: 'center' },
  earlierTitle: { ...typography.caption, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
});
