import React, { useEffect, useRef, useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
//
// D38 Milestone 2 (package P5b): the request a customer sent, and the quote
// form. The provider sees what the customer wrote, their photos, video and
// voice note, their answers under the questions the admin wrote, the budget
// (or "Customer is not sure of the price"), and, on a reopened request, why
// the customer declined an earlier quote (never the amount).
//
// The quote: a total price in pesos (or "Use the customer's budget", which
// the server prices at the top of the customer's range), what is included
// (10 to 300 characters), what could change the price (optional), and the
// earliest date and time window. An itemized breakdown is optional. Each
// form carries one clientRequestId, so a double tap or a retry never sends a
// second quote. With the default of one open quote per request, the first
// pro to send a quote gets the request; everyone else sees "Another pro is
// handling this request".
//
// After quoting, the screen shows the pro's own quote read-only, with
// Withdraw and Message customer. Its status is the server's display status
// from My quotes (a customer cancel leaves the quote row 'submitted', so the
// raw status cannot say "Request closed"), and Withdraw shows only while that
// status is waiting.
//
// Opening an open request marks it viewed on the server, so the request
// summary (tab badge, "New requests (N)") is re-read and the inbox card
// loses its New badge. The full-screen photo viewer fetches fresh links when
// the list is older than 8 minutes (signed links live 10).
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  describeSlot,
  getBookingQuotes,
  getMyQuotes,
  getProviderJobRequest,
  submitQuote,
  withdrawQuote,
  type IntakeQuestionAnswer,
  type ProviderJobRequestDetail,
  type ProviderJobRequestPage,
  type QuoteSubmissionPayload,
  type QuoteTimeWindow,
} from '@/services/request.service';
import { listTemplates, type QuoteTemplate } from '@/services/provider-crm.service';
import { showToast } from '@/lib/toast';
import api from '@/services/api';
import { formatPHP } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errors';
import { apiErrorInfo } from '@/utils/media-errors';
import { formatJobRequestBudget } from '@/utils/jobRequestBudget';
import { uuidV4 } from '@/utils/uuid';
import { providerChatRoute } from '@/utils/chat-routes';
import { colors, spacing, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';
import { Routes } from '@/config/navigation';
import { REALTIME_EVENTS, type JobRequestClosedPayload } from '@/config/realtime-events';
import { X, ChevronLeft, ChevronRight } from '@/components/icons';
import { useResponsive } from '@/hooks/useResponsive';
import { useSocketEvent } from '@/hooks/useSocketEvent';
import { ErrorState, LazyImage } from '@/components/ui';
import { listBookingMedia, mediaUrl } from '@/services/job-media.service';
import ConfirmModal from '@/components/ConfirmModal';
import { JobMediaGallery } from '@/components/job-media/JobMediaGallery';
import { QuoteSlotPicker, windowsForDate } from '@/components/provider/QuoteSlotPicker';
import { declineSignal, MY_QUOTE_STATUS_LABELS, MY_QUOTES_KEY, PROVIDER_LEADS_KEY } from '@/components/provider/RequestInbox';
import { refreshProviderRequestSummary } from '@/hooks/useProviderRequestSummary';

interface LineItemDraft {
  id: number;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  itemType: 'labor' | 'materials' | 'equipment' | 'other';
}

let nextItemId = 1;

function createEmptyItem(): LineItemDraft {
  return { id: nextItemId++, description: '', quantity: '1', unit: 'unit', unitPrice: '', itemType: 'labor' };
}

/** "What is included" and "Could change if" are capped at 300 characters by the server. */
const QUOTE_TEXT_MAX = 300;
/** The server needs at least 10 characters of "What is included". */
const QUOTE_INCLUDED_MIN = 10;
/** Signed media links live 10 minutes; the viewer fetches fresh ones after 8. */
const MEDIA_LINK_REFRESH_AFTER_MS = 8 * 60_000;

const URGENCY_LABELS: Record<string, string> = {
  same_day: 'Same day',
  within_3_days: 'Within 3 days',
  within_a_week: 'Within a week',
  flexible: 'Flexible',
};

// Used only when My quotes cannot place this quote (for example it is not
// on its first page); the My quotes display status is preferred.
const OWN_QUOTE_STATUS: Record<string, string> = {
  submitted: 'Waiting for the customer',
  accepted: 'Accepted by the customer',
  declined: 'Not accepted',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
};

/** Plain words for the quote errors the server sends with a code. */
const QUOTE_ERROR_COPY: Readonly<Record<string, string>> = {
  QUOTE_SLOT_INVALID:
    'That time can no longer be offered. The window may end too soon for the customer to confirm. Choose a later window or another date.',
  ACCEPT_BUDGET_UNAVAILABLE:
    "This customer has not set a budget you can accept. Enter your own price instead.",
  ACCEPT_BUDGET_PRICE_MISMATCH:
    "The customer's budget has changed. Check the new amount below, then send your quote again.",
  // The server sends REQUEST_CLOSED on submit for any request that is no
  // longer requested or quoted, including one where the customer already
  // accepted another pro, so this copy does not guess the cause.
  REQUEST_CLOSED: 'Another pro may have it, or the customer closed it. New requests show in your Requests tab.',
};

/** The request was cancelled or expired (detail 410, or the live close event says so). */
const REQUEST_CANCELLED_COPY = 'This request has closed. The customer cancelled it or it expired, so it can no longer take quotes.';

// taken: another pro holds it. closed: cancelled or expired (known).
// ended: no longer taking quotes, cause unknown (submit REQUEST_CLOSED).
type RequestGone = 'taken' | 'closed' | 'ended' | 'missing';

function humanizeKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

// The lead detail labels each answer with the question the admin wrote
// (intakeQuestions). An older server without the field falls back to the
// raw answers with a readable version of the key.
function answerRows(request: ProviderJobRequestDetail): IntakeQuestionAnswer[] {
  if (Array.isArray(request.intakeQuestions)) return request.intakeQuestions;
  return Object.entries(request.intakeAnswers ?? {})
    .filter((entry): entry is [string, string | number | boolean] => (
      typeof entry[1] === 'string' || typeof entry[1] === 'number' || typeof entry[1] === 'boolean'
    ))
    .map(([key, value]) => ({ key, label: null, unit: null, value }));
}

function formatAnswer(row: IntakeQuestionAnswer): string {
  if (typeof row.value === 'boolean') return row.value ? 'Yes' : 'No';
  return row.unit ? `${String(row.value)} ${row.unit}` : String(row.value);
}

/** Pesos typed by the provider ("1500", "1,250.50") as centavos, or null. */
function pesosToCentavos(text: string): number | null {
  const cleaned = text.replace(/[,\s₱]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const centavos = Math.round(Number(cleaned) * 100);
  return Number.isSafeInteger(centavos) ? centavos : null;
}

/** The top of the customer's range, when the server will let a pro accept it. */
function acceptableBudget(request: ProviderJobRequestDetail | undefined): number | null {
  if (!request || request.budgetUnknown) return null;
  const max = typeof request.budgetMax === 'number' ? request.budgetMax : null;
  return max != null && max >= platformConfig.minimumQuoteAmount ? max : null;
}

function goneCopy(gone: RequestGone): { title: string; body: string } {
  if (gone === 'taken') {
    return {
      title: 'Another pro is handling this request',
      body: 'Another pro responded first, so this request has left your list. New requests show in your Requests tab.',
    };
  }
  if (gone === 'closed') {
    return { title: 'This request has closed', body: REQUEST_CANCELLED_COPY };
  }
  if (gone === 'ended') {
    return { title: 'This request is no longer taking quotes', body: QUOTE_ERROR_COPY.REQUEST_CLOSED! };
  }
  return { title: 'This request is no longer available', body: 'It may have been taken by another pro or closed by the customer.' };
}

export default function QuoteBuilderScreen(): React.ReactElement {
  const { id: bookingId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isPhone } = useResponsive();
  // One idempotency key per quote form.
  const [clientRequestId] = useState(() => uuidV4());
  const [priceText, setPriceText] = useState('');
  const [acceptBudget, setAcceptBudget] = useState(false);
  const [included, setIncluded] = useState('');
  const [couldChangeIf, setCouldChangeIf] = useState('');
  const [slot, setSlot] = useState<{ date: string | null; window: QuoteTimeWindow | null }>({ date: null, window: null });
  const [itemized, setItemized] = useState(false);
  const [estimatedDays, setEstimatedDays] = useState('');
  const [items, setItems] = useState<LineItemDraft[]>([createEmptyItem()]);
  const [gone, setGone] = useState<RequestGone | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  const bookingQuery = useQuery<ProviderJobRequestDetail>({
    queryKey: ['providerJobRequest', bookingId],
    queryFn: () => getProviderJobRequest(bookingId ?? ''),
    enabled: !!bookingId,
    // A taken, closed or missing request will not come back on a retry.
    retry: (failures, error) => apiErrorInfo(error).status >= 500 && failures < 2,
  });
  const request = bookingQuery.data;
  const myQuote = request?.myQuote ?? null;
  const detailError = bookingQuery.isError ? apiErrorInfo(bookingQuery.error) : null;
  const detailGone: RequestGone | null = !detailError
    ? null
    : detailError.code === 'REQUEST_TAKEN' ? 'taken'
      : detailError.code === 'REQUEST_CLOSED' ? 'closed'
        : detailError.status === 404 ? 'missing' : null;
  const requestGone = gone ?? detailGone;

  // What became of the pro's quote, in the same words as My quotes (the
  // same cache entry as that list).
  const myQuotesQuery = useQuery({
    queryKey: MY_QUOTES_KEY,
    queryFn: () => getMyQuotes('all', 1),
    enabled: !!myQuote,
    staleTime: 15 * 1000,
  });
  const listedQuote = myQuote ? (myQuotesQuery.data?.quotes ?? []).find((quote) => quote.quoteId === myQuote.id) ?? null : null;
  const refreshOwnQuoteStatus = (): void => {
    void queryClient.invalidateQueries({ queryKey: MY_QUOTES_KEY }, { cancelRefetch: false });
    void queryClient.invalidateQueries({ queryKey: ['providerJobRequest', bookingId] }, { cancelRefetch: false });
  };

  // Live: another pro filled the request, or the customer cancelled it.
  useSocketEvent<JobRequestClosedPayload>(REALTIME_EVENTS.JOB_REQUEST_CLOSED, (payload) => {
    if (!payload || payload.bookingId !== bookingId) return;
    if (myQuote) {
      // The pro already quoted: their quote card shows what became of it.
      refreshOwnQuoteStatus();
      return;
    }
    setGone(payload.reason === 'cancelled' || payload.reason === 'expired' ? 'closed' : 'taken');
    void queryClient.invalidateQueries({ queryKey: PROVIDER_LEADS_KEY });
  });
  // Live: the customer decided on this pro's quote.
  const onQuoteOutcome = (payload: { bookingId?: string } | null | undefined): void => {
    if (myQuote && payload?.bookingId === bookingId) refreshOwnQuoteStatus();
  };
  useSocketEvent<{ bookingId?: string }>(REALTIME_EVENTS.QUOTE_DECLINED, onQuoteOutcome);
  useSocketEvent<{ bookingId?: string }>(REALTIME_EVENTS.QUOTE_ACCEPTED, onQuoteOutcome);
  useSocketEvent<{ bookingId?: string }>(REALTIME_EVENTS.QUOTE_NOT_SELECTED, onQuoteOutcome);

  // Opening an open request marked it viewed on the server (the detail is
  // read before the mark, so it still says viewedAt null): drop its New
  // badge in the inbox and re-read the unseen count, once per request.
  const markedSeenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!request || !bookingId || request.myQuote || request.viewedAt != null) return;
    if (markedSeenRef.current === bookingId) return;
    markedSeenRef.current = bookingId;
    const seenAt = new Date(Date.now()).toISOString();
    queryClient.setQueryData<ProviderJobRequestPage>(PROVIDER_LEADS_KEY, (current) => {
      if (!current) return current;
      return {
        ...current,
        requests: current.requests.map((item) => (item.id === bookingId && item.viewedAt == null ? { ...item, viewedAt: seenAt } : item)),
      };
    });
    refreshProviderRequestSummary(queryClient);
  }, [request, bookingId, queryClient]);

  // The pro's own quote in full (what is included, could change if, thread),
  // once they have quoted. A provider sees only their own quote here.
  const ownQuoteQuery = useQuery({
    queryKey: ['providerOwnQuote', bookingId],
    queryFn: () => getBookingQuotes(bookingId ?? ''),
    enabled: !!bookingId && !!myQuote,
  });
  const ownQuote = (ownQuoteQuery.data ?? []).find((quote) => quote.id === myQuote?.id) ?? null;

  // The same media list the gallery shows (shared cache entry), so the
  // customer's photos can also be opened full screen to price from.
  const mediaQuery = useQuery({
    queryKey: ['job-media', bookingId],
    queryFn: () => listBookingMedia(bookingId ?? ''),
    enabled: !!bookingId && !!request,
    staleTime: 5 * 60_000,
  });
  const viewerPhotos = [
    ...(mediaQuery.data?.items ?? [])
      .filter((item) => item.kind === 'photo')
      .map((item) => mediaUrl(item.url))
      .filter((url): url is string => !!url),
    ...(mediaQuery.data?.legacyPhotos ?? []),
  ];
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // Signed links live 10 minutes: a pro who spent longer writing the quote
  // gets fresh ones before the viewer shows a photo.
  const refreshStaleMediaLinks = (): void => {
    const age = Date.now() - mediaQuery.dataUpdatedAt;
    if (mediaQuery.dataUpdatedAt > 0 && age > MEDIA_LINK_REFRESH_AFTER_MS && !mediaQuery.isFetching) void mediaQuery.refetch();
  };
  const showViewerPhoto = (index: number | null): void => {
    if (index !== null) refreshStaleMediaLinks();
    setViewerIndex(index);
  };

  const budgetMax = acceptableBudget(request);

  const canAddMoreItems = items.length < 20;
  const addItem = (): void => {
    if (canAddMoreItems) setItems([...items, createEmptyItem()]);
  };

  // D27 Phase 7b — prefill line items from a saved quote template.
  const [showTemplates, setShowTemplates] = useState(false);
  const templatesQuery = useQuery({ queryKey: ['quote-templates'], queryFn: listTemplates, enabled: showTemplates, staleTime: 60 * 1000 });
  const relevantTemplates = (templatesQuery.data ?? []).filter((template) => {
    if (!template.categoryId && !template.subcategoryId) return true;
    if (!request) return false;
    if (template.subcategoryId) return template.subcategoryId === request.subcategoryId;
    return template.categoryId === request.categoryId;
  });
  const applyTemplate = (t: QuoteTemplate): void => {
    setItems(t.items.map((it) => ({
      id: nextItemId++,
      description: it.description,
      quantity: String(it.quantity),
      unit: it.unit,
      unitPrice: String(it.unitPrice / 100),
      itemType: (['labor', 'materials', 'equipment', 'other'].includes(it.itemType) ? it.itemType : 'labor') as LineItemDraft['itemType'],
    })));
    setShowTemplates(false);
    showToast(`Loaded "${t.name}"`, 'success');
  };

  const updateItem = (id: number, field: keyof LineItemDraft, value: string): void => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const removeItem = (id: number): void => {
    if (items.length > 1) setItems(items.filter(item => item.id !== id));
  };

  // One canonical draft for both the preview and the submission (Bug UX-131:
  // quantity 0 is never previewed as zero and then sent as one).
  const activeItems = items.filter((item) => item.description.trim() || item.unitPrice.trim());
  const preparedLineItems = activeItems.map((item) => ({
    description: item.description.trim(),
    quantity: Number(item.quantity),
    unit: item.unit.trim(),
    unitPrice: Math.round(Number(item.unitPrice) * 100),
    itemType: item.itemType,
  }));
  const lineItemsValid = preparedLineItems.length > 0 && preparedLineItems.every((item) =>
    item.description.length > 0
    && item.description.length <= 500
    && Number.isFinite(item.quantity)
    && item.quantity >= 0.01
    && item.quantity <= 99999
    && item.unit.length > 0
    && item.unit.length <= 30
    && Number.isSafeInteger(item.unitPrice)
    && item.unitPrice >= 1,
  );
  const itemsTotal = lineItemsValid
    ? preparedLineItems.reduce((sum, item) => sum + Math.round(item.quantity * item.unitPrice), 0)
    : 0;
  const typedPrice = pesosToCentavos(priceText);
  // What the customer would pay, for this preview only. The server sets the
  // stored price: the budget maximum for an accepted budget, the line-item
  // total for an itemized quote.
  const totalAmount = acceptBudget && budgetMax != null
    ? budgetMax
    : itemized ? itemsTotal : (typedPrice ?? 0);

  // BUG-PHASE48-02 fix — show the provider's net after platform commission.
  const providerMeQuery = useQuery<{ tier: string; commissionRate: number }>({
    queryKey: ['providerCommissionPreview', bookingId],
    queryFn: async () => {
      const res = await api.get<{ data: { tier: string; commissionRate: number } }>(`/api/v1/providers/me/commission-preview?bookingId=${encodeURIComponent(bookingId!)}`);
      return { tier: res.data.data.tier, commissionRate: res.data.data.commissionRate };
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!bookingId,
  });
  const providerTier = providerMeQuery.data?.tier;
  const commissionRate = providerMeQuery.data?.commissionRate;
  const commissionAmount = commissionRate == null ? null : Math.round(totalAmount * commissionRate);
  const netEarnings = commissionAmount == null ? null : totalAmount - commissionAmount;

  const refreshRequestLists = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['providerJobRequest', bookingId] });
    void queryClient.invalidateQueries({ queryKey: ['providerOwnQuote', bookingId] });
    void queryClient.invalidateQueries({ queryKey: PROVIDER_LEADS_KEY });
    void queryClient.invalidateQueries({ queryKey: MY_QUOTES_KEY });
    refreshProviderRequestSummary(queryClient);
  };

  const mutation = useMutation({
    mutationFn: () => {
      const payload: QuoteSubmissionPayload = {
        quotedPrice: totalAmount,
        description: included.trim(),
        couldChangeIf: couldChangeIf.trim() || undefined,
        earliestDate: slot.date ?? '',
        earliestTimeWindow: slot.window ?? 'morning',
        clientRequestId,
      };
      if (acceptBudget) payload.acceptBudget = true;
      if (itemized) {
        payload.lineItems = preparedLineItems;
        if (estimatedDays.trim()) payload.estimatedDays = Number(estimatedDays);
      }
      return submitQuote(bookingId ?? '', payload);
    },
    onMutate: () => setFormError(null),
    onSuccess: () => {
      showToast('Quote sent. The customer has been told.', 'success');
      refreshRequestLists();
    },
    onError: (err: unknown) => {
      const { code } = apiErrorInfo(err);
      if (code === 'REQUEST_TAKEN') {
        setGone('taken');
        void queryClient.invalidateQueries({ queryKey: PROVIDER_LEADS_KEY });
        return;
      }
      if (code === 'REQUEST_CLOSED') {
        setGone('ended');
        void queryClient.invalidateQueries({ queryKey: PROVIDER_LEADS_KEY });
        return;
      }
      if (code === 'QUOTE_ALREADY_SUBMITTED') {
        showToast('You already sent a quote for this request.', 'info');
        refreshRequestLists();
        return;
      }
      if (code === 'ACCEPT_BUDGET_UNAVAILABLE') {
        setAcceptBudget(false);
        setFormError(QUOTE_ERROR_COPY.ACCEPT_BUDGET_UNAVAILABLE!);
        return;
      }
      if (code === 'ACCEPT_BUDGET_PRICE_MISMATCH') {
        setFormError(QUOTE_ERROR_COPY.ACCEPT_BUDGET_PRICE_MISMATCH!);
        void bookingQuery.refetch();
        return;
      }
      if (code === 'QUOTE_SLOT_INVALID') {
        setFormError(QUOTE_ERROR_COPY.QUOTE_SLOT_INVALID!);
        return;
      }
      setFormError(getErrorMessage(err, 'Could not send your quote. Check your connection and try again.'));
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: () => withdrawQuote(bookingId ?? '', myQuote?.id ?? ''),
    onSuccess: () => {
      setConfirmWithdraw(false);
      showToast('Quote withdrawn. The request goes back to other pros.', 'success');
      refreshRequestLists();
    },
    onError: (err: unknown) => {
      setConfirmWithdraw(false);
      showToast(apiErrorInfo(err).status === 409
        ? 'This quote can no longer be withdrawn. The customer has already decided, or the request has closed.'
        : getErrorMessage(err, 'Could not withdraw your quote.'), 'error');
      refreshRequestLists();
    },
  });

  const estimatedDaysNumber = estimatedDays.trim() ? Number(estimatedDays) : null;
  const estimatedDaysValid = !itemized || estimatedDaysNumber == null
    || (Number.isInteger(estimatedDaysNumber) && estimatedDaysNumber >= 1 && estimatedDaysNumber <= 365);
  const includedLength = included.trim().length;
  const includedValid = includedLength >= QUOTE_INCLUDED_MIN && includedLength <= QUOTE_TEXT_MAX;
  const slotValid = !!slot.date && !!slot.window && windowsForDate(slot.date).includes(slot.window);
  const priceValid = acceptBudget
    ? budgetMax != null
    : itemized
      ? lineItemsValid && itemsTotal >= platformConfig.minimumQuoteAmount
      : typedPrice != null && typedPrice >= platformConfig.minimumQuoteAmount;
  const isValid = !!request && !requestGone && includedValid && slotValid && priceValid && estimatedDaysValid;
  const missing: string[] = [];
  if (!priceValid) missing.push('your price');
  if (!includedValid) missing.push('what is included');
  if (!slotValid) missing.push('your earliest date and time window');

  const backToRequests = (): void => { router.replace(Routes.PROVIDER_TABS.REQUESTS); };

  const contextCard = (
    <View style={[styles.contextCard, !isPhone && styles.contextColumn]}>
      <Text style={styles.contextEyebrow}>CUSTOMER REQUEST</Text>
      {bookingQuery.isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : !request ? (
        detailGone ? (
          <Text style={styles.contextMuted}>{goneCopy(detailGone).title}</Text>
        ) : (
          <View>
            <Text style={styles.contextError}>The request details could not be loaded. Check your connection and try again.</Text>
            <TouchableOpacity style={styles.contextRetry} onPress={() => void bookingQuery.refetch()} accessibilityRole="button">
              <Text style={styles.contextRetryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )
      ) : (
        <>
          <Text style={styles.contextTitle}>{request.serviceName || request.categoryName || 'Custom service'}</Text>
          {[request.customerName, [request.barangay, request.city].filter(Boolean).join(', '), request.distanceKm != null ? `${request.distanceKm} km away` : null]
            .filter(Boolean).length > 0 ? (
              <Text style={styles.contextMeta}>
                {[request.customerName, [request.barangay, request.city].filter(Boolean).join(', '), request.distanceKm != null ? `${request.distanceKm} km away` : null]
                  .filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          <View style={styles.budgetBanner}>
            <Text style={styles.budgetBannerText}>
              {request.budgetUnknown
                ? 'Customer is not sure of the price'
                : formatJobRequestBudget(request.budgetMin, request.budgetMax)}
            </Text>
          </View>
          {declineSignal(request) ? (
            <View style={styles.declined} accessibilityRole="text">
              <Text style={styles.declinedText}>{declineSignal(request)}</Text>
            </View>
          ) : null}
          {request.description ? (
            <Text style={styles.contextDescription}>{request.description}</Text>
          ) : (
            <Text style={styles.contextMuted}>The customer did not write a description. Check what they sent and their answers.</Text>
          )}
          {bookingId ? (
            <View style={styles.mediaBlock}>
              <JobMediaGallery bookingId={bookingId} title="What the customer sent" />
              {viewerPhotos.length > 0 ? (
                <TouchableOpacity
                  style={styles.viewerOpen}
                  onPress={() => showViewerPhoto(0)}
                  accessibilityRole="button"
                  accessibilityLabel={`View the customer's photos full screen, ${viewerPhotos.length} ${viewerPhotos.length === 1 ? 'photo' : 'photos'}`}
                >
                  <Text style={styles.viewerOpenText}>{`View photos full screen (${viewerPhotos.length})`}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
          {request.urgency ? (
            <View style={styles.contextFacts}>
              <View style={styles.contextFact}>
                <Text style={styles.contextLabel}>Timing</Text>
                <Text style={styles.contextValue}>{URGENCY_LABELS[request.urgency] ?? request.urgency}</Text>
              </View>
            </View>
          ) : null}
          {answerRows(request).length > 0 ? (
            <View style={styles.intakeBlock}>
              <Text style={styles.contextLabel}>Customer answers</Text>
              {answerRows(request).map((row) => (
                <View key={row.key} style={styles.intakeRow}>
                  <Text style={styles.intakeKey}>{row.label ?? humanizeKey(row.key)}</Text>
                  <Text style={styles.intakeValue}>{formatAnswer(row)}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {/* Accepting a quote assigns the pro, and the booking (with the
              address) opens to them before payment. Hiding it until payment
              is Ken's open question 16 (critique M11). */}
          <Text style={styles.contextNote}>The street address is shared once the customer accepts your quote.</Text>
        </>
      )}
    </View>
  );

  const goneCard = requestGone ? (
    <View style={styles.stateCard} accessibilityRole="alert">
      <Text style={styles.stateTitle}>{goneCopy(requestGone).title}</Text>
      <Text style={styles.stateBody}>{goneCopy(requestGone).body}</Text>
      <TouchableOpacity style={styles.primaryBtn} onPress={backToRequests} accessibilityRole="button">
        <Text style={styles.primaryBtnText}>Back to requests</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  // Withdraw only while the server says the quote is waiting. When My quotes
  // cannot place the quote, the raw status decides (the server refuses a
  // withdraw that no longer applies, and the toast says so).
  const canWithdraw = !!myQuote && (listedQuote
    ? listedQuote.displayStatus === 'waiting'
    : myQuotesQuery.isFetched && myQuote.status === 'submitted');
  // The My quotes words once that list has answered; nothing while it loads,
  // so a stale "Waiting for the customer" never flashes on a closed request.
  const ownStatusLabel = !myQuote ? null
    : listedQuote ? (MY_QUOTE_STATUS_LABELS[listedQuote.displayStatus] ?? OWN_QUOTE_STATUS[myQuote.status] ?? myQuote.status)
      : myQuotesQuery.isFetched ? (OWN_QUOTE_STATUS[myQuote.status] ?? myQuote.status) : null;
  const ownQuoteCard = myQuote ? (
    <View style={styles.stateCard} accessibilityLabel="Your quote">
      <Text style={styles.contextEyebrow}>YOUR QUOTE</Text>
      <Text style={styles.ownPrice}>{formatPHP(myQuote.quotedPrice)}</Text>
      {ownStatusLabel ? <Text style={styles.ownStatus}>{ownStatusLabel}</Text> : null}
      {describeSlot(myQuote.earliestDate, myQuote.earliestTimeWindow) ? (
        <Text style={styles.ownLine}>{`Earliest: ${describeSlot(myQuote.earliestDate, myQuote.earliestTimeWindow)}`}</Text>
      ) : null}
      {ownQuote?.description ? (
        <View style={styles.ownSection}>
          <Text style={styles.contextLabel}>What is included</Text>
          <Text style={styles.ownLine}>{ownQuote.description}</Text>
        </View>
      ) : null}
      {ownQuote?.couldChangeIf ? (
        <View style={styles.ownSection}>
          <Text style={styles.contextLabel}>Could change if</Text>
          <Text style={styles.ownLine}>{ownQuote.couldChangeIf}</Text>
        </View>
      ) : null}
      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={() => router.push(providerChatRoute(bookingId ?? ''))}
        accessibilityRole="button"
        accessibilityLabel="Message customer"
      >
        <Text style={styles.secondaryBtnText}>Message customer</Text>
      </TouchableOpacity>
      {canWithdraw ? (
        <TouchableOpacity
          style={styles.withdrawBtn}
          onPress={() => setConfirmWithdraw(true)}
          disabled={withdrawMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel="Withdraw quote"
        >
          <Text style={styles.withdrawBtnText}>Withdraw quote</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  ) : null;

  const form = (
    <View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your price</Text>
        {budgetMax != null && !itemized ? (
          acceptBudget ? (
            <View style={styles.budgetAccepted}>
              <Text style={styles.budgetAcceptedText}>{`You are accepting the customer's budget of ${formatPHP(budgetMax)}.`}</Text>
              <TouchableOpacity
                onPress={() => setAcceptBudget(false)}
                style={styles.linkBtn}
                accessibilityRole="button"
                accessibilityLabel="Enter my own price"
              >
                <Text style={styles.linkBtnText}>Enter my own price</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.budgetActionBtn}
              onPress={() => { setAcceptBudget(true); setFormError(null); }}
              accessibilityRole="button"
              accessibilityLabel="Use the customer's budget"
            >
              <Text style={styles.budgetActionText}>{`Use the customer's budget (${formatPHP(budgetMax)})`}</Text>
            </TouchableOpacity>
          )
        ) : null}
        {!acceptBudget && !itemized ? (
          <>
            <Text style={styles.fieldLabel}>{`Total price (${platformConfig.currencySymbol})`}</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={priceText}
              onChangeText={setPriceText}
              placeholder="Example: 1500"
              placeholderTextColor={colors.textTertiary}
              accessibilityLabel="Total price in pesos"
            />
            {priceText.trim() && (typedPrice == null || typedPrice < platformConfig.minimumQuoteAmount) ? (
              <Text style={styles.fieldError}>{`Enter an amount of at least ${formatPHP(platformConfig.minimumQuoteAmount)}.`}</Text>
            ) : null}
          </>
        ) : null}
        <TouchableOpacity
          style={styles.toggleRow}
          onPress={() => {
            const next = !itemized;
            setItemized(next);
            // The server refuses an itemized quote that also accepts the budget.
            if (next) setAcceptBudget(false);
          }}
          accessibilityRole="switch"
          accessibilityLabel="Add an itemized breakdown"
          accessibilityState={{ checked: itemized }}
        >
          <View style={[styles.checkbox, itemized && styles.checkboxOn]} />
          <Text style={styles.toggleText}>Add an itemized breakdown</Text>
        </TouchableOpacity>
      </View>

      {itemized ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Line items</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TouchableOpacity onPress={() => setShowTemplates((v) => !v)} style={styles.templateBtn}>
                <Text style={styles.templateBtnText}>Use template</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={addItem}
                style={[styles.addItemBtn, !canAddMoreItems && styles.submitDisabled]}
                disabled={!canAddMoreItems}
              >
                <Text style={styles.addItemText}>+ Add Item</Text>
              </TouchableOpacity>
            </View>
          </View>

          {showTemplates && (
            <View style={styles.templatePanel}>
              {templatesQuery.isLoading ? (
                <ActivityIndicator size="small" color={colors.info} />
              ) : templatesQuery.isError ? (
                <ErrorState
                  compact
                  title="Quote templates unavailable"
                  message="We couldn't load your saved templates. You can retry or continue building this quote manually."
                  onRetry={() => void templatesQuery.refetch()}
                />
              ) : relevantTemplates.length === 0 ? (
                <Text style={styles.templateEmpty}>No templates match this service yet. Create one under Profile, Quote Templates, or save an all-services template.</Text>
              ) : (
                relevantTemplates.map((t) => (
                  <TouchableOpacity key={t.id} style={styles.templateRow} onPress={() => applyTemplate(t)}>
                    <Text style={styles.templateName}>{t.name}</Text>
                    <Text style={styles.templateMeta}>{t.items.length} item{t.items.length !== 1 ? 's' : ''} ›</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {items.map((item, idx) => (
            <View key={item.id} style={styles.lineItemCard}>
              <View style={styles.lineItemHeader}>
                <Text style={styles.lineItemNum}>#{idx + 1}</Text>
                {items.length > 1 && (
                  <TouchableOpacity onPress={() => removeItem(item.id)} style={styles.removeItemBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <X size={16} color={colors.error} />
                  </TouchableOpacity>
                )}
              </View>

              {/* BUG-PHASE195-01 fix — line-item description and unit match
                  the server caps (500 and 30, booking.validators.ts). */}
              <TextInput
                style={styles.input}
                value={item.description}
                onChangeText={(v) => updateItem(item.id, 'description', v)}
                placeholder="Item description"
                placeholderTextColor={colors.textTertiary}
                maxLength={500}
              />

              <View style={styles.typeRow}>
                {(['labor', 'materials', 'equipment', 'other'] as const).map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChip, item.itemType === t && styles.typeChipActive]}
                    onPress={() => updateItem(item.id, 'itemType', t)}
                  >
                    <Text style={[styles.typeChipText, item.itemType === t && styles.typeChipTextActive]}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.qtyPriceRow}>
                <View style={styles.fieldSmall}>
                  <Text style={styles.fieldLabel}>Qty</Text>
                  <TextInput
                    style={styles.smallInput}
                    keyboardType="numeric"
                    value={item.quantity}
                    onChangeText={(v) => updateItem(item.id, 'quantity', v)}
                  />
                </View>
                <View style={styles.fieldSmall}>
                  <Text style={styles.fieldLabel}>Unit</Text>
                  <TextInput
                    style={styles.smallInput}
                    value={item.unit}
                    onChangeText={(v) => updateItem(item.id, 'unit', v)}
                    placeholder="unit"
                    placeholderTextColor={colors.textTertiary}
                    maxLength={30}
                  />
                </View>
                <View style={styles.fieldMedium}>
                  <Text style={styles.fieldLabel}>Unit Price ({platformConfig.currencySymbol})</Text>
                  <TextInput
                    style={styles.smallInput}
                    keyboardType="numeric"
                    value={item.unitPrice}
                    onChangeText={(v) => updateItem(item.id, 'unitPrice', v)}
                    placeholder="0.00"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
              </View>

              {Number(item.quantity) > 0 && Number(item.unitPrice) > 0 && (
                <Text style={styles.lineTotal}>
                  Subtotal: {formatPHP(Math.round(Number(item.quantity) * Number(item.unitPrice) * 100))}
                </Text>
              )}
            </View>
          ))}
          {activeItems.length > 0 && !lineItemsValid && (
            <Text style={styles.fieldError}>Complete or remove every started line item. Quantity must be at least 0.01.</Text>
          )}
          {!canAddMoreItems && (
            <Text style={styles.fieldHelp}>Maximum 20 line items per quote.</Text>
          )}
          <View style={styles.daysRow}>
            <Text style={styles.fieldLabel}>Estimated duration</Text>
            <TextInput
              style={styles.daysInput}
              keyboardType="numeric"
              value={estimatedDays}
              onChangeText={setEstimatedDays}
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
              accessibilityLabel="Estimated duration in days"
            />
            <Text style={styles.daysLabel}>day(s)</Text>
          </View>
          {!estimatedDaysValid && <Text style={styles.fieldError}>Use a whole number from 1 to 365.</Text>}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What is included</Text>
        <TextInput
          style={styles.textArea}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          value={included}
          onChangeText={setIncluded}
          placeholder="Example: Clean and check one split-type aircon, including the drain line."
          placeholderTextColor={colors.textTertiary}
          maxLength={QUOTE_TEXT_MAX}
          accessibilityLabel="What is included"
        />
        <View style={styles.counterRow}>
          <Text style={styles.fieldHelp}>{`At least ${QUOTE_INCLUDED_MIN} characters.`}</Text>
          <Text style={styles.fieldHelp}>{`${included.length}/${QUOTE_TEXT_MAX}`}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Could change if (optional)</Text>
        <TextInput
          style={styles.textArea}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
          value={couldChangeIf}
          onChangeText={setCouldChangeIf}
          placeholder="Example: Parts need replacing after inspection."
          placeholderTextColor={colors.textTertiary}
          maxLength={QUOTE_TEXT_MAX}
          accessibilityLabel="Could change if"
        />
        <View style={styles.counterRow}>
          <Text style={styles.fieldHelp}>What could make the final price different.</Text>
          <Text style={styles.fieldHelp}>{`${couldChangeIf.length}/${QUOTE_TEXT_MAX}`}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <QuoteSlotPicker value={slot} onChange={(next) => { setSlot(next); setFormError(null); }} />
      </View>

      <View style={styles.totalBox}>
        {/* The customer service fee is 0 today (Ken, 2026-06-28); the customer's
            confirm screen shows any fee from the server, so never promise one here. */}
        <Text style={styles.totalLabel}>Your quote (the price the customer sees)</Text>
        <Text style={styles.totalValue}>{formatPHP(totalAmount)}</Text>
        {totalAmount > 0 && commissionRate != null && commissionAmount != null && providerTier && (
          <View style={styles.commissionRow}>
            <Text style={styles.commissionLabel}>
              − Platform commission ({Math.round(commissionRate * 100)}%, {providerTier} tier)
            </Text>
            <Text style={styles.commissionValue}>−{formatPHP(commissionAmount)}</Text>
          </View>
        )}
        {totalAmount > 0 && netEarnings != null && (
          <View style={styles.netRow}>
            <Text style={styles.netLabel}>Your net earnings</Text>
            <Text style={styles.netValue}>{formatPHP(netEarnings)}</Text>
          </View>
        )}
        {totalAmount > 0 && providerMeQuery.isLoading && (
          <View style={styles.commissionLoading} accessibilityLabel="Loading booking commission preview">
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.commissionLoadingText}>Loading booking commission preview…</Text>
          </View>
        )}
        {totalAmount > 0 && providerMeQuery.isError && (
          <ErrorState
            compact
            title="Commission preview unavailable"
            message="The customer total is accurate, but your net earnings cannot be confirmed yet."
            onRetry={() => void providerMeQuery.refetch()}
          />
        )}
      </View>

      {formError ? (
        <View style={styles.formError} accessibilityRole="alert">
          <Text style={styles.formErrorText}>{formError}</Text>
        </View>
      ) : null}
      {!isValid && request && !requestGone ? (
        <Text style={styles.fieldHelp}>{`To send, add ${missing.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`}</Text>
      ) : null}

      <TouchableOpacity
        style={[styles.submitBtn, (!isValid || mutation.isPending) && styles.submitDisabled]}
        onPress={() => mutation.mutate()}
        disabled={!isValid || mutation.isPending}
        accessibilityRole="button"
        accessibilityLabel="Send quote"
        accessibilityState={{ disabled: !isValid || mutation.isPending, busy: mutation.isPending }}
      >
        {mutation.isPending ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.submitText}>Send quote</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Request details</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}
      >
        <View
          style={[styles.workspace, !isPhone && styles.workspaceWide]}
          accessibilityLabel={isPhone ? 'Provider quote builder' : 'Wide provider quote workspace'}
        >
          {contextCard}
          <View style={styles.formColumn}>
            {goneCard ?? ownQuoteCard ?? (request ? form : null)}
          </View>
        </View>
      </ScrollView>
      {/* Full-screen viewer for the customer's photos. */}
      <Modal
        visible={viewerIndex !== null && viewerPhotos.length > 0}
        transparent
        animationType="fade"
        onRequestClose={() => showViewerPhoto(null)}
      >
        {viewerIndex !== null && viewerPhotos[viewerIndex] ? (
          <View style={styles.viewer} accessibilityViewIsModal accessibilityLabel="Customer photo viewer">
            <View style={styles.viewerTop}>
              <Text style={styles.viewerCount}>Photo {viewerIndex + 1} of {viewerPhotos.length}</Text>
              <TouchableOpacity
                style={styles.viewerClose}
                onPress={() => showViewerPhoto(null)}
                accessibilityRole="button"
                accessibilityLabel="Close photo"
              >
                <X size={24} color={colors.white} />
              </TouchableOpacity>
            </View>
            {/* One LazyImage per photo (the key), so a photo that fails to
                load does not leave Previous and Next stuck on the
                "image unavailable" placeholder for the photos that work. */}
            <LazyImage
              key={`${viewerIndex}:${viewerPhotos[viewerIndex]}`}
              source={viewerPhotos[viewerIndex]}
              containerStyle={styles.viewerImage}
              contentFit="contain"
              accessibilityLabel={`Customer photo ${viewerIndex + 1}, full screen`}
            />
            {viewerPhotos.length > 1 ? (
              <View style={styles.viewerNav}>
                <TouchableOpacity
                  style={styles.viewerNavBtn}
                  onPress={() => showViewerPhoto((viewerIndex + viewerPhotos.length - 1) % viewerPhotos.length)}
                  accessibilityRole="button"
                  accessibilityLabel="Previous photo"
                >
                  <ChevronLeft size={28} color={colors.white} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.viewerNavBtn}
                  onPress={() => showViewerPhoto((viewerIndex + 1) % viewerPhotos.length)}
                  accessibilityRole="button"
                  accessibilityLabel="Next photo"
                >
                  <ChevronRight size={28} color={colors.white} />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}
      </Modal>
      <ConfirmModal
        visible={confirmWithdraw}
        title="Withdraw your quote?"
        message="The customer will no longer see it and the request goes back to other pros. You cannot send another quote for this request."
        confirmLabel="Withdraw quote"
        cancelLabel="Keep my quote"
        destructive
        loading={withdrawMutation.isPending}
        onConfirm={() => withdrawMutation.mutate()}
        onCancel={() => setConfirmWithdraw(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { padding: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  bodyContentWide: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: spacing.xl },
  workspace: { gap: spacing.base },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl },
  contextCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.base },
  contextColumn: { width: 380 },
  formColumn: { flex: 1, minWidth: 0 },
  contextEyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.1, color: colors.primary, marginBottom: spacing.sm },
  contextTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  contextMeta: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm },
  contextDescription: { fontSize: 14, lineHeight: 21, color: colors.textSecondary, marginTop: spacing.sm },
  contextFacts: { gap: spacing.sm, marginTop: spacing.base },
  contextFact: { backgroundColor: colors.surfaceMuted, borderRadius: borderRadius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.md },
  contextLabel: { fontSize: 11, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.7 },
  contextValue: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 2 },
  contextNote: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, marginTop: spacing.base },
  contextError: { fontSize: 14, lineHeight: 20, color: colors.error },
  contextRetry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginTop: spacing.sm },
  contextRetryText: { fontSize: 14, color: colors.primary, fontWeight: '700' },
  contextMuted: { fontSize: 13, lineHeight: 19, color: colors.textTertiary, marginTop: spacing.sm },
  budgetBanner: { alignSelf: 'flex-start', backgroundColor: colors.primaryLight, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  budgetBannerText: { fontSize: 15, fontWeight: '800', color: colors.primary },
  declined: { backgroundColor: colors.warningLight, borderRadius: borderRadius.md, padding: spacing.sm, marginTop: spacing.sm },
  declinedText: { fontSize: 13, fontWeight: '600', color: colors.text },
  mediaBlock: { marginTop: spacing.base, gap: spacing.sm },
  viewerOpen: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  viewerOpenText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  viewer: { flex: 1, backgroundColor: 'rgba(5,26,62,0.96)', justifyContent: 'center' },
  viewerTop: { position: 'absolute', top: spacing.xl, left: spacing.base, right: spacing.base, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 2 },
  viewerCount: { fontSize: 14, fontWeight: '600', color: colors.white },
  viewerClose: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '75%', backgroundColor: 'transparent' },
  viewerNav: { position: 'absolute', bottom: spacing.xl, left: spacing.base, right: spacing.base, flexDirection: 'row', justifyContent: 'space-between' },
  viewerNavBtn: { minWidth: 52, minHeight: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  intakeBlock: { marginTop: spacing.base, gap: spacing.xs },
  intakeRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  intakeKey: { fontSize: 12, color: colors.textSecondary, flex: 1 },
  intakeValue: { fontSize: 12, color: colors.text, fontWeight: '700', flex: 1, textAlign: 'right' },
  stateCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.base, gap: spacing.sm },
  stateTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  stateBody: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  ownPrice: { fontSize: 28, fontWeight: '800', color: colors.text },
  ownStatus: { fontSize: 14, fontWeight: '700', color: colors.primary },
  ownSection: { gap: 2 },
  ownLine: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.lg, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },
  secondaryBtn: { borderRadius: borderRadius.lg, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primary, marginTop: spacing.sm },
  secondaryBtnText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  withdrawBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  withdrawBtnText: { fontSize: 14, fontWeight: '700', color: colors.error },
  section: { marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  textArea: { backgroundColor: colors.white, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.text, minHeight: 80 },
  input: { backgroundColor: colors.white, borderRadius: borderRadius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.text, marginBottom: spacing.sm },
  counterRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  budgetActionBtn: { backgroundColor: colors.primaryLight, borderRadius: borderRadius.lg, minHeight: 44, paddingHorizontal: spacing.base, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primary, marginBottom: spacing.md },
  budgetActionText: { fontSize: 14, fontWeight: '700', color: colors.primary, textAlign: 'center' },
  budgetAccepted: { backgroundColor: colors.successLight, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md, gap: spacing.xs },
  budgetAcceptedText: { fontSize: 14, fontWeight: '700', color: colors.success },
  linkBtn: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  linkBtnText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.white },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleText: { fontSize: 14, fontWeight: '600', color: colors.text },
  addItemBtn: { backgroundColor: colors.primaryLight, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 8, minHeight: 44, justifyContent: 'center' as const },
  addItemText: { fontSize: 13, fontWeight: '600', color: colors.info },
  templateBtn: { backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 8, minHeight: 44, justifyContent: 'center' as const, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  templateBtnText: { fontSize: 13, fontWeight: '600', color: colors.text },
  templatePanel: { backgroundColor: colors.surfaceMuted, borderRadius: borderRadius.md, padding: spacing.sm, marginBottom: spacing.sm, gap: spacing.xs, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  templateEmpty: { fontSize: 12, color: colors.textTertiary, padding: spacing.xs },
  templateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  templateName: { fontSize: 14, fontWeight: '600', color: colors.text },
  templateMeta: { fontSize: 12, color: colors.textSecondary },
  lineItemCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: spacing.md },
  lineItemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  lineItemNum: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  removeItemBtn: { padding: spacing.sm, minWidth: 44, minHeight: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
  typeRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  typeChip: { paddingVertical: spacing.sm, paddingHorizontal: 10, borderRadius: borderRadius.sm, backgroundColor: colors.backgroundSecondary, minHeight: 36 },
  typeChipActive: { backgroundColor: colors.text },
  typeChipText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  typeChipTextActive: { color: colors.white },
  qtyPriceRow: { flexDirection: 'row', gap: spacing.sm },
  fieldSmall: { flex: 1 },
  fieldMedium: { flex: 2 },
  fieldLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs },
  smallInput: { backgroundColor: colors.backgroundSecondary, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.text },
  lineTotal: { fontSize: 13, fontWeight: '600', color: colors.success, textAlign: 'right', marginTop: spacing.sm },
  daysRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  daysInput: { width: 80, backgroundColor: colors.white, borderRadius: borderRadius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.text, textAlign: 'center' },
  daysLabel: { fontSize: 14, color: colors.textSecondary },
  totalBox: { backgroundColor: colors.text, borderRadius: borderRadius.lg, padding: spacing.base, marginBottom: spacing.base },
  totalLabel: { fontSize: 12, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' },
  totalValue: { fontSize: 28, fontWeight: '800', color: colors.white, marginTop: spacing.xs, textAlign: 'center' },
  commissionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  commissionLabel: { fontSize: 12, color: colors.textTertiary, flex: 1 },
  commissionValue: { fontSize: 13, color: colors.warning, fontWeight: '600' },
  commissionLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md },
  commissionLoadingText: { fontSize: 12, color: colors.textSecondary },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  netLabel: { fontSize: 13, color: colors.white, fontWeight: '700' },
  netValue: { fontSize: 16, color: colors.success, fontWeight: '800' },
  formError: { backgroundColor: colors.errorLight, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm },
  formErrorText: { fontSize: 14, color: colors.error, fontWeight: '600' },
  fieldError: { fontSize: 12, color: colors.error, marginTop: spacing.xs },
  fieldHelp: { fontSize: 12, color: colors.textTertiary, marginTop: spacing.xs },
  submitBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.lg, paddingVertical: spacing.base, alignItems: 'center', marginTop: spacing.sm },
  submitDisabled: { opacity: 0.5 },
  submitText: { fontSize: 16, fontWeight: '700', color: colors.white },
});
