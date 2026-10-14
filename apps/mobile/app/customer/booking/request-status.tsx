// D38 Milestone 2 (package P5b): where the customer's request stands.
//
// The customer lands here after sending a request. Everything shown comes
// from GET /bookings/:id/request-status, which the server works out (the
// app only displays the stage):
//   waiting          "We sent your request to N local pros"
//   still looking    after the configured minutes with no quote; "Our team
//                    has been alerted" only when the back office really was
//                    (opsReviewAt set)
//   quote_ready      a button to the quote
//   reopened         after a decline: "We sent your request to more pros",
//                    only when this round reached pros (notifiedProviderCount);
//                    otherwise "We are looking for more pros" (the last round,
//                    or a round that found nobody, sends nothing)
//   no_pros          nobody offers this service nearby yet
//   payment_pending  accepted, pay to confirm
//   booked / closed
//
// Refresh: on the live events for this request (request:updated,
// quote:received, a stored notice), once when the still-looking time is
// reached, and every requestProviderPollSeconds while the live connection is
// down (only while this screen is in front and the app is in the
// foreground). The server sends a new round to pros just after it answers
// and emits no event after a normal send, so a fresh round that shows no
// pros sent yet is read again after 3 and 10 seconds.
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { getRequestStatus, type RequestStatus } from '@/services/request.service';
import { ErrorState, Skeleton } from '@/components/ui';
import ConfirmModal from '@/components/ConfirmModal';
import PulsingDot from '@/components/PulsingDot';
import { ChevronLeft } from '@/components/icons';
import { JobMediaGallery } from '@/components/job-media/JobMediaGallery';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { buildRoute, Routes } from '@/config/navigation';
import { REALTIME_EVENTS, type NotificationNewPayload } from '@/config/realtime-events';
import { formatRelative } from '@/utils/date';
import { getErrorMessage } from '@/utils/errors';
import { showToast } from '@/lib/toast';
import { useSocketEvent } from '@/hooks/useSocketEvent';
import { usePollWhileFocused } from '@/hooks/usePollWhileFocused';
import { useRequestConfig } from '@/hooks/useRequestConfig';
import { useResponsive } from '@/hooks/useResponsive';
import { CUSTOMER_REQUEST_SUMMARY_KEY } from '@/hooks/useCustomerRequestSummary';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const OPEN_STAGES = new Set(['waiting', 'no_pros', 'quote_ready', 'reopened']);
const CANCELLABLE = new Set(['requested', 'quoted']);

const TEAM_ALERTED_COPY = 'Our team has been alerted and may contact you to help.';

/** A round opened this recently may still be on its way to pros. */
const FRESH_ROUND_MS = 2 * 60_000;
/** Waits before the re-reads of a fresh round with no pros sent yet (3 s, then 10 s). */
const FRESH_RECHECK_DELAYS_MS: readonly number[] = [3_000, 7_000];

function notifiedCount(status: RequestStatus): number {
  return Math.max(0, Number(status.notifiedProviderCount) || 0);
}

function pros(count: number): string {
  return `${count} local ${count === 1 ? 'pro' : 'pros'}`;
}

interface StageCopy {
  title: string;
  body: string;
}

/** The headline and explanation for a request status. */
function stageCopy(status: RequestStatus): StageCopy {
  const notified = notifiedCount(status);
  const quotes = Math.max(0, Number(status.openQuoteCount) || 0);
  switch (status.stage) {
    case 'waiting':
      if (status.stillLooking) {
        return {
          title: 'Still looking for a pro',
          body: 'No pro has responded yet. You can keep waiting, contact support to add details, or cancel the request.',
        };
      }
      return {
        title: notified > 0 ? `We sent your request to ${pros(notified)}` : 'Your request is open to local pros',
        body: status.maxOpenQuotes === 1
          ? 'The first pro to respond sends you a price and the earliest time they can come. You then accept or decline. We will notify you when a quote arrives.'
          : `Up to ${status.maxOpenQuotes} pros can send you a price. You compare and choose. We will notify you when quotes arrive.`,
      };
    case 'reopened':
      if (status.stillLooking) {
        return {
          title: 'Still looking for a pro',
          body: 'No other pro has responded yet. You can keep waiting, contact support to add details, or cancel the request.',
        };
      }
      // Claim a send only when this round reached someone: the last allowed
      // round (back office asked instead) and a round with nobody to invite
      // send nothing.
      if (notified > 0) {
        return {
          title: 'We sent your request to more pros',
          body: `${pros(notified)} ${notified === 1 ? 'has' : 'have'} been told about your request this time. We will notify you when a quote arrives.`,
        };
      }
      return {
        title: 'We are looking for more pros',
        body: 'Your request is still open. We will notify you when a quote arrives.',
      };
    case 'no_pros':
      return {
        title: 'No pros are available for this request yet',
        body: 'We could not find a pro who offers this service in your area right now.',
      };
    case 'quote_ready':
      return {
        title: quotes > 1 ? `You have ${quotes} quotes` : 'You have a quote',
        body: 'Check the price, what is included and the earliest time, then accept or decline.',
      };
    case 'payment_pending':
      return {
        title: 'Pay to confirm your booking',
        body: 'You accepted a quote. The pro gets the job once your payment goes through.',
      };
    case 'booked':
      return { title: 'Your booking is confirmed', body: 'The pro has the job. Follow it from your booking.' };
    case 'closed':
    default:
      return {
        title: 'This request is closed',
        body: status.status === 'cancelled_by_customer'
          ? 'You cancelled this request. You can post a new one at any time.'
          : 'It was cancelled, or no pro took it in time. You can post a new request at any time.',
      };
  }
}

export default function RequestStatusScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ bookingId: string }>();
  const bookingId = firstParam(params?.bookingId);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const config = useRequestConfig();
  const { isPhone } = useResponsive();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [stillLookingCheck, setStillLookingCheck] = useState(0);

  const cachedStage = (queryClient.getQueryData<RequestStatus>(['request-status', bookingId]) ?? null)?.stage;
  const refetchInterval = usePollWhileFocused({
    connectedMs: false,
    disconnectedMs: config.requestProviderPollSeconds * 1000,
    enabled: !!bookingId && (cachedStage == null || OPEN_STAGES.has(cachedStage) || cachedStage === 'payment_pending'),
  });
  const statusQuery = useQuery({
    queryKey: ['request-status', bookingId],
    queryFn: () => getRequestStatus(bookingId ?? ''),
    enabled: !!bookingId,
    refetchInterval,
  });
  const status = statusQuery.data;

  const refresh = (): void => { void queryClient.invalidateQueries({ queryKey: ['request-status', bookingId] }); };
  const forThisRequest = (payload: { bookingId?: string } | null | undefined): void => {
    if (payload?.bookingId === bookingId) refresh();
  };
  useSocketEvent<{ bookingId?: string }>(bookingId ? REALTIME_EVENTS.REQUEST_UPDATED : null, forThisRequest);
  useSocketEvent<{ bookingId?: string }>(bookingId ? REALTIME_EVENTS.QUOTE_RECEIVED : null, forThisRequest);
  useSocketEvent<NotificationNewPayload>(bookingId ? REALTIME_EVENTS.NOTIFICATION_NEW : null, (payload) => {
    if (payload?.data && payload.data.bookingId === bookingId) refresh();
  });

  // Ask once more when the still-looking time is reached, so the screen
  // changes even while the live connection is up and nothing else happens.
  useEffect(() => {
    if (!status || status.stillLooking || !['waiting', 'reopened'].includes(status.stage) || !status.roundOpenedAt) {
      return undefined;
    }
    const due = new Date(status.roundOpenedAt).getTime() + status.stillLookingAfterMinutes * 60_000;
    const wait = due - Date.now();
    if (!Number.isFinite(wait)) return undefined;
    const timer = setTimeout(() => setStillLookingCheck((n) => n + 1), Math.max(1_000, wait + 5_000));
    return () => clearTimeout(timer);
  }, [status]);
  useEffect(() => {
    if (stillLookingCheck > 0) refresh();
    // refresh only reads stable values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stillLookingCheck]);

  // Just after sending: the first read can land before the server has sent
  // the round to pros, and no event follows a normal send. Ask again (at
  // most twice) while a fresh round shows nobody sent.
  const [freshChecks, setFreshChecks] = useState(0);
  useEffect(() => {
    if (!status || freshChecks >= FRESH_RECHECK_DELAYS_MS.length) return undefined;
    if (status.stillLooking || !['waiting', 'reopened'].includes(status.stage)) return undefined;
    if (notifiedCount(status) > 0 || !status.roundOpenedAt) return undefined;
    const age = Date.now() - new Date(status.roundOpenedAt).getTime();
    if (!Number.isFinite(age) || age > FRESH_ROUND_MS) return undefined;
    const timer = setTimeout(() => {
      setFreshChecks((n) => n + 1);
      refresh();
    }, FRESH_RECHECK_DELAYS_MS[freshChecks]);
    return () => clearTimeout(timer);
    // refresh only reads stable values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, freshChecks]);

  const cancelMutation = useMutation({
    mutationFn: async () => {
      // The existing customer cancel path (PATCH /bookings/:id/status).
      await api.patch(`/api/v1/bookings/${encodeURIComponent(bookingId ?? '')}/status`, { status: 'cancelled_by_customer' });
    },
    onSuccess: () => {
      setConfirmCancel(false);
      refresh();
      void queryClient.invalidateQueries({ queryKey: ['booking', bookingId] });
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      void queryClient.invalidateQueries({ queryKey: ['bookingQuotes', bookingId] });
      void queryClient.invalidateQueries({ queryKey: CUSTOMER_REQUEST_SUMMARY_KEY });
      showToast('Request cancelled. Pros can no longer see it.', 'success');
    },
    onError: (err: unknown) => {
      setConfirmCancel(false);
      showToast(getErrorMessage(err, 'Could not cancel this request.'), 'error');
    },
  });

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
        <ChevronLeft size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} accessibilityRole="header">Your request</Text>
      <View style={styles.placeholder} />
    </View>
  );

  if (!bookingId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header}
        <ErrorState
          title="Request unavailable"
          message="Open a request from your bookings to see where it stands."
          actionLabel="View bookings"
          actionAccessibilityLabel="View bookings"
          onRetry={() => router.replace(Routes.TABS.BOOKINGS)}
        />
      </View>
    );
  }

  if (statusQuery.isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]} accessibilityLabel="Loading your request">
        {header}
        <View style={styles.content}>
          <Skeleton width="100%" height={140} borderRadius={borderRadius.lg} />
        </View>
      </View>
    );
  }

  if (!status) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header}
        <ErrorState
          message="We couldn't load your request. Check your connection and try again."
          onRetry={() => void statusQuery.refetch()}
        />
      </View>
    );
  }

  const copy = stageCopy(status);
  const isOpen = OPEN_STAGES.has(status.stage);
  const looking = ['waiting', 'reopened', 'no_pros'].includes(status.stage);
  const showTeamAlerted = looking && !!status.opsReviewAt;
  // "Sent ..." on a reopened round only when it reached pros.
  const showSentLine = looking && !status.stillLooking && !!status.roundOpenedAt
    && !(status.stage === 'reopened' && notifiedCount(status) === 0);
  const canCancel = CANCELLABLE.has(status.status);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {header}
      <ScrollView contentContainerStyle={[styles.content, !isPhone && styles.contentWide]}>
        <View style={styles.statusCard} accessibilityLabel="Request status">
          {status.serviceName ? <Text style={styles.service}>{status.serviceName}</Text> : null}
          <Text style={styles.title} accessibilityRole="header">{copy.title}</Text>
          {showSentLine && status.roundOpenedAt ? (
            <View style={styles.liveRow}>
              <PulsingDot size={8} color={colors.primary} />
              <Text style={styles.liveText}>{`Sent ${formatRelative(status.roundOpenedAt).toLowerCase()}`}</Text>
            </View>
          ) : null}
          <Text style={styles.body}>{copy.body}</Text>
          {showTeamAlerted ? (
            <View style={styles.teamNote} accessibilityRole="text">
              <Text style={styles.teamNoteText}>{TEAM_ALERTED_COPY}</Text>
            </View>
          ) : null}

          {status.stage === 'quote_ready' ? (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push({ pathname: Routes.CUSTOMER.BOOKING_QUOTES, params: { bookingId } })}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>{status.openQuoteCount > 1 ? 'See the quotes' : 'See the quote'}</Text>
            </TouchableOpacity>
          ) : null}
          {status.stage === 'payment_pending' ? (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push({ pathname: Routes.CUSTOMER.BOOKING_PAY, params: { bookingId } })}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>Pay now</Text>
            </TouchableOpacity>
          ) : null}
          {status.stage === 'booked' ? (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push(buildRoute(Routes.CUSTOMER.BOOKING_DETAIL, { id: bookingId }))}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>View booking</Text>
            </TouchableOpacity>
          ) : null}
          {status.stage === 'closed' ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace(Routes.TABS.HOME)} accessibilityRole="button">
              <Text style={styles.primaryBtnText}>Book a service</Text>
            </TouchableOpacity>
          ) : null}
          {status.stillLooking || status.stage === 'no_pros' ? (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.push({
                pathname: Routes.SUPPORT.NEW,
                params: { bookingId, type: 'booking_issue', subject: 'Help finding a pro for my request' },
              })}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryBtnText}>Contact support</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.card}>
          <JobMediaGallery bookingId={bookingId} title="What you sent" />
          <TouchableOpacity
            onPress={() => router.push(buildRoute(Routes.CUSTOMER.BOOKING_DETAIL, { id: bookingId }))}
            style={styles.linkBtn}
            accessibilityRole="button"
          >
            <Text style={styles.linkText}>See request details</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push(Routes.CUSTOMER.MESSAGES)} style={styles.linkBtn} accessibilityRole="button">
            <Text style={styles.linkText}>Messages</Text>
          </TouchableOpacity>
        </View>

        {isOpen && canCancel ? (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => setConfirmCancel(true)}
            disabled={cancelMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Cancel request"
          >
            <Text style={styles.cancelText}>Cancel request</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
      <ConfirmModal
        visible={confirmCancel}
        title="Cancel this request?"
        message="Pros will no longer see it, and nothing has been charged. You can post a new request at any time."
        confirmLabel="Cancel request"
        cancelLabel="Keep request"
        destructive
        loading={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutate()}
        onCancel={() => setConfirmCancel(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  placeholder: { width: 44 },
  content: { padding: spacing.base, paddingBottom: 48, gap: spacing.base },
  contentWide: { width: '100%', maxWidth: 640, alignSelf: 'center', padding: spacing.xl },
  statusCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  service: { ...typography.caption, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { ...typography.h2, color: colors.text },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  liveText: { ...typography.caption, color: colors.textSecondary },
  body: { ...typography.body, color: colors.textSecondary },
  teamNote: { backgroundColor: colors.infoLight, borderRadius: borderRadius.md, padding: spacing.md },
  teamNoteText: { ...typography.bodySmall, color: colors.text, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.base, gap: spacing.sm },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.lg, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  primaryBtnText: { ...typography.button, color: colors.white },
  secondaryBtn: { borderRadius: borderRadius.lg, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primary },
  secondaryBtnText: { ...typography.bodySmall, fontWeight: '700', color: colors.primary },
  linkBtn: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { ...typography.bodySmall, fontWeight: '700', color: colors.primary },
  cancelBtn: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { ...typography.bodySmall, fontWeight: '700', color: colors.error },
});
