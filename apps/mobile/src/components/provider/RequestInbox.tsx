/**
 * D38 Milestone 2 (package P5b): the provider's Requests inbox and My quotes
 * list, shown on the Requests tab (app/(provider-tabs)/requests.tsx) and on
 * the old /provider/leads link.
 *
 * Requests: open customer requests this pro may quote
 * (GET /providers/me/job-requests). Each card shows the area, budget (or
 * "Customer is not sure of the price"), what was sent, and, after a
 * customer declined an earlier quote, the reason (never the amount).
 *
 * Refresh (merged plan bad news 5): every requestProviderPollSeconds (30)
 * while this screen is in front, the app is in the foreground and the live
 * connection is down. While connected the server's events do the work:
 * new:job_request re-reads the list and job_request:closed removes that card
 * at once. Coming back to the screen re-reads once if the list is stale,
 * which also covers eligible pros the server did not push to (it pushes to
 * the best request_max_invites matches). The API allows 100 requests per
 * user per 15 minutes.
 */
import React, { useCallback, useEffect } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, EmptyState, ErrorState, LazyImage, SkeletonCard } from '@/components/ui';
import { Inbox, WifiOff, ClipboardList } from '@/components/icons';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { buildRoute, Routes } from '@/config/navigation';
import { REALTIME_EVENTS, type JobRequestClosedPayload } from '@/config/realtime-events';
import { formatJobRequestBudget } from '@/utils/jobRequestBudget';
import { formatPHP } from '@/utils/currency';
import { formatRelative } from '@/utils/date';
import { getErrorMessage } from '@/utils/errors';
import { useResponsive, byBreakpoint } from '@/hooks/useResponsive';
import { useSocketEvent } from '@/hooks/useSocketEvent';
import { usePollWhileFocused, useScreenFocused } from '@/hooks/usePollWhileFocused';
import { useRequestConfig } from '@/hooks/useRequestConfig';
import { useProviderRequestSummary } from '@/hooks/useProviderRequestSummary';
import {
  describeSlot,
  getMyQuotes,
  getProviderJobRequests,
  providerDeclineReasonLabel,
  type JobRequestMediaCounts,
  type MyQuote,
  type MyQuoteDisplayStatus,
  type ProviderJobRequest,
  type ProviderJobRequestPage,
} from '@/services/request.service';

/** The inbox cache. The quote screen and the live-connection gate refresh it by this key. */
export const PROVIDER_LEADS_KEY = ['provider-leads'] as const;
export const MY_QUOTES_KEY = ['provider-my-quotes'] as const;

const URGENCY_LABEL: Record<string, string> = {
  same_day: 'Same day',
  within_3_days: 'Within 3 days',
  within_a_week: 'Within a week',
  flexible: 'Flexible',
};

// Photos from requests sent before APK 1.0.4 are public links and show as
// thumbnails; newer photos are private and are counted here, then shown in
// full on the request screen.
const CARD_THUMBNAILS = 3;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "2 photos, 1 video and 1 voice note", or null when nothing private was attached. */
export function mediaCountsLabel(counts: JobRequestMediaCounts | null | undefined): string | null {
  if (!counts) return null;
  const parts: string[] = [];
  if (counts.photo > 0) parts.push(plural(counts.photo, 'photo', 'photos'));
  if (counts.video > 0) parts.push(plural(counts.video, 'video', 'videos'));
  if (counts.voice > 0) parts.push(plural(counts.voice, 'voice note', 'voice notes'));
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * "The customer declined an earlier quote. Reason: Price too high." for the
 * latest decline, or null. The amount is never shown, whatever the server
 * sends: earlier prices must not anchor new quotes.
 */
export function declineSignal(request: Pick<ProviderJobRequest, 'customerDeclines'>): string | null {
  const declines = Array.isArray(request.customerDeclines) ? request.customerDeclines : [];
  const latest = declines[declines.length - 1];
  if (!latest) return null;
  return `The customer declined an earlier quote. Reason: ${providerDeclineReasonLabel(latest.reason)}.`;
}

/**
 * Re-read a list once when its screen comes back into focus and the data is
 * older than its stale time. Not on first mount (the query fetches then), and
 * never while a read is already running.
 */
function useRefetchOnFocusWhenStale(query: { isStale: boolean; isFetching: boolean; dataUpdatedAt: number; refetch: () => unknown }): void {
  const focused = useScreenFocused();
  const queryRef = React.useRef(query);
  queryRef.current = query;
  useEffect(() => {
    const current = queryRef.current;
    if (focused && current.dataUpdatedAt > 0 && current.isStale && !current.isFetching) void current.refetch();
  }, [focused]);
}

function budgetText(request: ProviderJobRequest): string {
  if (request.budgetUnknown) return 'Customer is not sure of the price';
  return formatJobRequestBudget(request.budgetMin, request.budgetMax);
}

export interface RequestInboxProps {
  /** Shown above the list (the screen title row lives in the screen). */
  header?: React.ReactNode;
}

export function RequestInbox({ header }: RequestInboxProps): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const config = useRequestConfig();
  const { summary } = useProviderRequestSummary();
  const refetchInterval = usePollWhileFocused({
    connectedMs: false,
    disconnectedMs: config.requestProviderPollSeconds * 1000,
  });
  const q = useQuery({
    queryKey: PROVIDER_LEADS_KEY,
    queryFn: () => getProviderJobRequests(1),
    staleTime: 15 * 1000,
    refetchInterval,
  });
  useRefetchOnFocusWhenStale(q);

  useSocketEvent(REALTIME_EVENTS.NEW_JOB_REQUEST, () => {
    void queryClient.invalidateQueries({ queryKey: PROVIDER_LEADS_KEY }, { cancelRefetch: false });
  });
  useSocketEvent<JobRequestClosedPayload>(REALTIME_EVENTS.JOB_REQUEST_CLOSED, (payload) => {
    const bookingId = payload?.bookingId;
    if (!bookingId) return;
    // Another pro got there first, or the customer cancelled: the card goes now.
    queryClient.setQueryData<ProviderJobRequestPage>(PROVIDER_LEADS_KEY, (current) => {
      if (!current) return current;
      const requests = current.requests.filter((request) => request.id !== bookingId);
      if (requests.length === current.requests.length) return current;
      return { ...current, requests, total: Math.max(0, current.total - 1) };
    });
    // The request summary re-reads from its one live copy (the tab layout).
  });

  const { breakpoint, isPhone } = useResponsive();
  const numColumns = byBreakpoint(breakpoint, { phone: 1, tablet: 2, desktop: 2 });

  const renderItem = useCallback(
    ({ item }: { item: ProviderJobRequest }) => {
      const location = [item.barangay, item.city].filter(Boolean).join(', ');
      const photos = Array.isArray(item.jobPhotos) ? item.jobPhotos : [];
      const shownPhotos = photos.slice(0, CARD_THUMBNAILS);
      const morePhotos = photos.length - shownPhotos.length;
      const media = mediaCountsLabel(item.mediaCounts);
      const declined = declineSignal(item);
      const service = item.serviceName || item.categoryName || 'Service request';
      const isNew = item.viewedAt == null;
      return (
        <TouchableOpacity
          style={[styles.card, numColumns > 1 && styles.cardGrid]}
          activeOpacity={0.7}
          onPress={() => router.push(buildRoute(Routes.PROVIDER.JOB_QUOTE, { id: item.id }))}
          accessibilityRole="button"
          accessibilityLabel={`Open ${service} job request and prepare a quote`}
        >
          <View style={styles.cardTop}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.category}>{service}</Text>
              {isNew ? <Badge label="New" backgroundColor={colors.primary} size="sm" /> : null}
            </View>
            <Text style={styles.time}>{formatRelative(item.createdAt)}</Text>
          </View>
          {item.description ? (
            <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
          ) : null}
          {declined ? (
            <View style={styles.declined} accessibilityRole="text">
              <Text style={styles.declinedText}>{declined}</Text>
            </View>
          ) : null}
          {shownPhotos.length > 0 ? (
            <View style={styles.thumbRow} accessibilityLabel={`${photos.length} customer photo${photos.length === 1 ? '' : 's'}`}>
              {shownPhotos.map((uri, index) => (
                <LazyImage
                  key={uri}
                  source={uri}
                  containerStyle={styles.thumb}
                  accessibilityLabel={`Customer photo ${index + 1} of ${photos.length}`}
                />
              ))}
              {morePhotos > 0 ? (
                <View style={[styles.thumb, styles.thumbMore]}>
                  <Text style={styles.thumbMoreText}>+{morePhotos}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          {media ? <Text style={styles.media}>{`Includes ${media}`}</Text> : null}
          <View style={styles.metaRow}>
            {item.urgency ? <Badge label={URGENCY_LABEL[item.urgency] ?? item.urgency} backgroundColor={colors.warning} /> : null}
            <Text style={item.budgetUnknown || (item.budgetMin == null && item.budgetMax == null) ? styles.budgetUnsure : styles.budget}>
              {budgetText(item)}
            </Text>
          </View>
          <Text style={styles.location} numberOfLines={1}>
            {location || 'Area shared on the request'}
            {item.distanceKm != null ? ` · ${item.distanceKm} km away` : ''}
          </Text>
          <Text style={styles.cta}>Send a quote ›</Text>
        </TouchableOpacity>
      );
    },
    [router, numColumns],
  );

  const total = q.data?.total ?? 0;
  const lifecycle = config.requestMaxOpenQuotes === 1
    ? 'The first pro to send a quote gets the request. The customer then accepts or declines it. If they decline, the request comes back to other pros.'
    : `Up to ${config.requestMaxOpenQuotes} pros can send a quote on each request. The customer compares them and picks one.`;

  const listHeader = (
    <View style={styles.headerStack}>
      {header}
      {!summary.isAvailable ? (
        <View style={styles.offline} accessibilityRole="alert" accessibilityLabel="You are offline">
          <WifiOff size={18} color={colors.warningDark} />
          <Text style={styles.offlineText}>
            You're offline, so customers are not sent to you. Go online on the dashboard to get new requests.
          </Text>
        </View>
      ) : null}
      {total > 0 ? (
        <View style={styles.requestSummary}>
          <Text style={styles.count}>{`${plural(total, 'open request', 'open requests')} in your area`}</Text>
          <Text style={styles.summaryText}>{lifecycle}</Text>
        </View>
      ) : null}
    </View>
  );

  if (q.isLoading) {
    return (
      <View style={[styles.body, !isPhone && styles.bodyWide]}>
        {listHeader}
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }
  if (q.isError) {
    return (
      <View style={[styles.body, !isPhone && styles.bodyWide]}>
        {listHeader}
        <ErrorState message={getErrorMessage(q.error, 'Could not load requests.')} onRetry={() => void q.refetch()} />
      </View>
    );
  }
  return (
    <FlatList
      data={q.data?.requests ?? []}
      key={`requests-${numColumns}`}
      numColumns={numColumns}
      columnWrapperStyle={numColumns > 1 ? styles.gridRow : undefined}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={[styles.body, !isPhone && styles.bodyWide]}
      accessibilityLabel={numColumns > 1 ? 'Tablet and desktop provider job request grid' : 'Provider job request list'}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={
        <EmptyState
          icon={<Inbox size={48} color={colors.textTertiary} />}
          title="No open requests right now"
          description="When a customer in your service area describes a job you offer, it shows up here with what they sent and their budget. Check that your services and service area are set so requests can reach you."
        />
      }
    />
  );
}

// ────────────────────────────────────────────────────────────────────
// My quotes
// ────────────────────────────────────────────────────────────────────

export const MY_QUOTE_STATUS_LABELS: Readonly<Record<MyQuoteDisplayStatus, string>> = {
  waiting: 'Waiting for the customer',
  accepted: 'Accepted, waiting for payment',
  booked: 'Booked',
  declined: 'Declined by the customer',
  not_selected: 'Customer chose another pro',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
  request_closed: 'Request closed',
};

const STATUS_TONE: Readonly<Record<MyQuoteDisplayStatus, string>> = {
  waiting: colors.info,
  accepted: colors.success,
  booked: colors.success,
  declined: colors.error,
  not_selected: colors.textTertiary,
  expired: colors.textTertiary,
  withdrawn: colors.textTertiary,
  request_closed: colors.textTertiary,
};

export function MyQuotesList({ header }: RequestInboxProps): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const config = useRequestConfig();
  const { isPhone } = useResponsive();
  const refetchInterval = usePollWhileFocused({
    connectedMs: false,
    disconnectedMs: config.requestProviderPollSeconds * 1000,
  });
  const q = useQuery({
    queryKey: MY_QUOTES_KEY,
    queryFn: () => getMyQuotes('all', 1),
    staleTime: 15 * 1000,
    refetchInterval,
  });
  useRefetchOnFocusWhenStale(q);
  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: MY_QUOTES_KEY }, { cancelRefetch: false });
  };
  useSocketEvent(REALTIME_EVENTS.QUOTE_DECLINED, refresh);
  useSocketEvent(REALTIME_EVENTS.QUOTE_ACCEPTED, refresh);
  useSocketEvent(REALTIME_EVENTS.QUOTE_NOT_SELECTED, refresh);

  const open = (quote: MyQuote): void => {
    if (quote.displayStatus === 'booked' || quote.displayStatus === 'accepted') {
      router.push(buildRoute(Routes.PROVIDER.JOB_DETAIL, { id: quote.bookingId }));
      return;
    }
    router.push(buildRoute(Routes.PROVIDER.JOB_QUOTE, { id: quote.bookingId }));
  };

  const renderItem = ({ item }: { item: MyQuote }): React.ReactElement => {
    const label = MY_QUOTE_STATUS_LABELS[item.displayStatus] ?? item.displayStatus;
    const area = [item.barangay, item.city].filter(Boolean).join(', ');
    const slot = describeSlot(item.earliestDate, item.earliestTimeWindow);
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => open(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.serviceName}, ${label}`}
      >
        <View style={styles.cardTop}>
          <Text style={styles.category}>{item.serviceName}</Text>
          <Text style={styles.myPrice}>{formatPHP(item.quotedPrice)}</Text>
        </View>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: STATUS_TONE[item.displayStatus] ?? colors.textTertiary }]} />
          <Text style={styles.statusText}>{label}</Text>
        </View>
        {item.displayStatus === 'declined' ? (
          <Text style={styles.reason}>{`Reason: ${providerDeclineReasonLabel(item.declineReason)}`}</Text>
        ) : null}
        {slot ? <Text style={styles.metaLine}>{`Your earliest slot: ${slot}`}</Text> : null}
        <Text style={styles.metaLine}>{[area, `Sent ${formatRelative(item.createdAt)}`].filter(Boolean).join(' · ')}</Text>
      </TouchableOpacity>
    );
  };

  if (q.isLoading) {
    return (
      <View style={[styles.body, !isPhone && styles.bodyWide]}>
        {header}
        <SkeletonCard />
      </View>
    );
  }
  if (q.isError) {
    return (
      <View style={[styles.body, !isPhone && styles.bodyWide]}>
        {header}
        <ErrorState message={getErrorMessage(q.error, 'Could not load your quotes.')} onRetry={() => void q.refetch()} />
      </View>
    );
  }
  return (
    <FlatList
      data={q.data?.quotes ?? []}
      keyExtractor={(item) => item.quoteId}
      renderItem={renderItem}
      contentContainerStyle={[styles.body, !isPhone && styles.bodyWide]}
      accessibilityLabel="My quotes"
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
      ListHeaderComponent={<View style={styles.headerStack}>{header}</View>}
      ListEmptyComponent={
        <EmptyState
          icon={<ClipboardList size={48} color={colors.textTertiary} />}
          title="No quotes yet"
          description="Quotes you send show here, with what the customer decided."
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  bodyWide: { width: '100%', maxWidth: 1120, alignSelf: 'center', padding: spacing.xl },
  headerStack: { gap: spacing.sm, marginBottom: spacing.sm },
  offline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  offlineText: { ...typography.bodySmall, color: colors.text, flex: 1 },
  requestSummary: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  count: { ...typography.body, color: colors.text, fontWeight: '700', marginBottom: spacing.xs },
  summaryText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  gridRow: { gap: spacing.sm },
  cardGrid: { flex: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  category: { ...typography.body, fontWeight: '700', color: colors.text, flexShrink: 1 },
  time: { ...typography.caption, color: colors.textTertiary },
  description: { ...typography.bodySmall, color: colors.textSecondary },
  declined: { backgroundColor: colors.warningLight, borderRadius: borderRadius.md, padding: spacing.sm },
  declinedText: { ...typography.caption, color: colors.text, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  budget: { ...typography.bodySmall, fontWeight: '700', color: colors.primary },
  budgetUnsure: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  thumbRow: { flexDirection: 'row', gap: spacing.xs },
  thumb: { width: 64, height: 64, borderRadius: borderRadius.md, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  thumbMore: { backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  thumbMoreText: { ...typography.bodySmall, fontWeight: '700', color: colors.textSecondary },
  media: { ...typography.caption, color: colors.textSecondary },
  location: { ...typography.caption, color: colors.textSecondary },
  cta: { ...typography.bodySmall, fontWeight: '700', color: colors.primary },
  myPrice: { ...typography.body, fontWeight: '700', color: colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  reason: { ...typography.caption, color: colors.textSecondary },
  metaLine: { ...typography.caption, color: colors.textSecondary },
});

export default RequestInbox;
