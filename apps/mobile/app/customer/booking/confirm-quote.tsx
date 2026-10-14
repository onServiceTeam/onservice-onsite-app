// D38 Milestone 2 (package P5b): "Confirm booking", the step between
// accepting a pro's quote and paying.
//
// Everything on this screen comes from the server's read-only preview
// (GET /bookings/:id/quotes/:quoteId/confirm-preview): the pro's price, any
// suki discount, the service fee and the total (the same calculations the
// accept step uses), the wallet balance, the pro, the proposed date and
// window with the time to be available from (E83 interim default), and the
// address. The app computes no amount.
//
// Confirm is blocked when the wallet cannot cover the total (merged plan
// question 2, default "block"): card, GCash, Maya and wallet top-ups are not
// available yet (E14), so a confirmed booking the wallet cannot pay would sit
// unpaid. A slot that has passed cannot be confirmed (409 QUOTE_SLOT_PASSED).
// The cancellation summary is the policy's introduction and a link, with no
// percentages while E09 is open.
//
// On Confirm: POST .../accept, then the existing pay screen (router.replace).
// Accept is not idempotent: a repeat gets a plain 409. After a timeout, a
// server error or a plain 409, the screen checks the quote on the server
// (GET /bookings/:id/quotes) and, when it is already accepted, goes on to
// payment instead of saying the quote is gone (P5b review).
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptQuote,
  describeSlot,
  getBookingQuotes,
  getConfirmPreview,
  manilaDateKeyOf,
  manilaTimeLabel,
  relativeDateLabel,
  type ConfirmPreview,
} from '@/services/request.service';
import { fetchCancellationPolicy, policyToConfirmSummary } from '@/utils/cancellation-policy';
import { formatPHP } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errors';
import { apiErrorInfo } from '@/utils/media-errors';
import { customerChatRoute } from '@/utils/chat-routes';
import { showToast } from '@/lib/toast';
import Avatar from '@/components/Avatar';
import { ErrorState, Skeleton } from '@/components/ui';
import { ChevronLeft, Star, AlertTriangle } from '@/components/icons';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Routes } from '@/config/navigation';
import { useResponsive } from '@/hooks/useResponsive';
import { CUSTOMER_REQUEST_SUMMARY_KEY } from '@/hooks/useCustomerRequestSummary';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const SLOT_PASSED_COPY =
  'The time this pro offered has passed, so this quote cannot be confirmed. Message the pro to agree a new time, or go back and decline this quote so other pros can respond.';

const QUOTE_GONE_COPY =
  'This quote is no longer available. It may have expired, or the pro withdrew it. Go back to your request to see where it stands.';

/**
 * Accept the quote. When the answer says nothing certain (no response, a
 * server error, or a plain 409 that a repeat accept gets), ask the server
 * whether this quote is already accepted: an accept that was saved but whose
 * answer was lost must still lead to payment.
 */
async function acceptOrRecover(bookingId: string, quoteId: string): Promise<void> {
  try {
    await acceptQuote(bookingId, quoteId);
  } catch (err) {
    const info = apiErrorInfo(err);
    const maybeSaved = info.code !== 'QUOTE_SLOT_PASSED'
      && (info.status === 0 || info.status === 408 || info.status === 409 || info.status >= 500);
    if (!maybeSaved) throw err;
    let alreadyAccepted = false;
    try {
      const quotes = await getBookingQuotes(bookingId);
      alreadyAccepted = quotes.some((quote) => quote.id === quoteId && quote.status === 'accepted');
    } catch {
      // Still no answer: report the original failure.
    }
    if (!alreadyAccepted) throw err;
  }
}

/** "Be available from 8:30 AM, tomorrow (Thu 15 Oct)." from the server's job time. */
function availableFromLine(startsAt: string | null | undefined, nowMs: number = Date.now()): string | null {
  if (!startsAt) return null;
  const time = manilaTimeLabel(startsAt);
  const day = manilaDateKeyOf(startsAt);
  if (!time || !day) return null;
  const relative = relativeDateLabel(day, nowMs);
  return `Be available from ${time}, ${relative === 'Today' || relative === 'Tomorrow' ? relative.toLowerCase() : relative}.`;
}

export default function ConfirmQuoteScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ bookingId: string; quoteId: string }>();
  const bookingId = firstParam(params?.bookingId);
  const quoteId = firstParam(params?.quoteId);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isPhone } = useResponsive();
  const [slotPassed, setSlotPassed] = useState(false);
  const [quoteGone, setQuoteGone] = useState(false);

  const previewQuery = useQuery<ConfirmPreview>({
    queryKey: ['confirm-preview', bookingId, quoteId],
    queryFn: () => getConfirmPreview(bookingId ?? '', quoteId ?? ''),
    enabled: !!bookingId && !!quoteId,
    retry: (failures, error) => apiErrorInfo(error).status >= 500 && failures < 2,
    staleTime: 0,
  });
  const policyQuery = useQuery({
    queryKey: ['cancellation-policy'],
    queryFn: fetchCancellationPolicy,
    staleTime: 5 * 60_000,
  });

  const preview = previewQuery.data;
  const previewGone = previewQuery.isError && [404, 409].includes(apiErrorInfo(previewQuery.error).status);
  const passed = slotPassed || preview?.slot?.status === 'passed';
  const gone = quoteGone || previewGone;
  const walletShort = !!preview && !preview.walletCovers;

  const acceptMutation = useMutation({
    mutationFn: () => acceptOrRecover(bookingId ?? '', quoteId ?? ''),
    onSuccess: () => {
      // OPS-559: the booking is now payment_pending. Reset the cached copy so
      // the pay screen loads it fresh, and refresh the lists and request views.
      void queryClient.invalidateQueries({ queryKey: ['bookingQuotes', bookingId] });
      void queryClient.resetQueries({ queryKey: ['booking', bookingId] });
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      void queryClient.invalidateQueries({ queryKey: ['activeBookings'] });
      void queryClient.invalidateQueries({ queryKey: ['request-status', bookingId] });
      void queryClient.invalidateQueries({ queryKey: CUSTOMER_REQUEST_SUMMARY_KEY });
      // Not confirmed yet: the booking is confirmed once the payment goes through.
      showToast('Quote accepted. Pay now to confirm your booking.', 'success');
      router.replace({ pathname: Routes.CUSTOMER.BOOKING_PAY, params: { bookingId: bookingId ?? '' } });
    },
    onError: (err: unknown) => {
      const info = apiErrorInfo(err);
      if (info.code === 'QUOTE_SLOT_PASSED') {
        setSlotPassed(true);
        return;
      }
      if (info.status === 404 || info.status === 409) {
        setQuoteGone(true);
        void previewQuery.refetch();
        return;
      }
      showToast(getErrorMessage(err, 'Could not confirm this booking. Check your connection and try again.'), 'error');
    },
  });

  const backToRequest = (): void => {
    router.replace({ pathname: Routes.CUSTOMER.BOOKING_REQUEST_STATUS, params: { bookingId: bookingId ?? '' } });
  };
  const backToQuotes = (): void => {
    router.replace({ pathname: Routes.CUSTOMER.BOOKING_QUOTES, params: { bookingId: bookingId ?? '' } });
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
        <ChevronLeft size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} accessibilityRole="header">Confirm booking</Text>
      <View style={styles.placeholder} />
    </View>
  );

  if (!bookingId || !quoteId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header}
        <ErrorState
          title="Quote unavailable"
          message="Open Confirm booking from a quote on one of your requests."
          actionLabel="View bookings"
          actionAccessibilityLabel="View bookings"
          onRetry={() => router.replace(Routes.TABS.BOOKINGS)}
        />
      </View>
    );
  }

  if (previewQuery.isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]} accessibilityLabel="Loading the booking total">
        {header}
        <View style={styles.content}>
          <Skeleton width="100%" height={88} borderRadius={borderRadius.lg} style={{ marginBottom: spacing.base }} />
          <Skeleton width="100%" height={160} borderRadius={borderRadius.lg} />
        </View>
      </View>
    );
  }

  if (gone || (!preview && previewQuery.isError)) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header}
        {gone ? (
          <View style={styles.content}>
            <View style={styles.warningCard} accessibilityRole="alert">
              <Text style={styles.warningTitle}>Quote no longer available</Text>
              <Text style={styles.warningText}>{QUOTE_GONE_COPY}</Text>
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={backToRequest} accessibilityRole="button">
              <Text style={styles.primaryBtnText}>See request status</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ErrorState
            message="We couldn't load the booking total. Check your connection and try again."
            onRetry={() => void previewQuery.refetch()}
          />
        )}
      </View>
    );
  }

  if (!preview) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header}
        <ErrorState message="We couldn't load the booking total." onRetry={() => void previewQuery.refetch()} />
      </View>
    );
  }

  const provider = preview.provider;
  const providerName = provider?.name || 'Your pro';
  const slotWords = describeSlot(preview.slot?.date, preview.slot?.window);
  const availableFrom = passed ? null : availableFromLine(preview.slot?.startsAt);
  const address = [preview.address?.line, preview.address?.barangay, preview.address?.city].filter(Boolean).join(', ');
  const policySummary = policyQuery.data ? policyToConfirmSummary(policyQuery.data) : null;
  const canConfirm = !passed && !walletShort && !acceptMutation.isPending;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {header}
      <ScrollView contentContainerStyle={[styles.content, !isPhone && styles.contentWide]}>
        <View style={styles.card}>
          <View style={styles.providerRow}>
            <Avatar uri={provider?.photoUrl ?? null} name={providerName} size={48} />
            <View style={styles.providerCopy}>
              <Text style={styles.providerName}>{providerName}</Text>
              {!provider || provider.isNew ? (
                <Text style={styles.meta}>New on onService</Text>
              ) : (
                <View style={styles.ratingRow}>
                  <Star size={13} color={colors.warning} />
                  <Text style={styles.meta}>{`${Number(provider.ratingAverage).toFixed(1)} (${provider.ratingCount} reviews)`}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.card} accessibilityLabel="When">
          <Text style={styles.label}>Proposed time</Text>
          <Text style={styles.value}>{slotWords ?? 'To be agreed with the pro'}</Text>
          {availableFrom ? <Text style={styles.emphasis}>{availableFrom}</Text> : null}
          <Text style={styles.label}>Address</Text>
          <Text style={styles.value}>{address || 'The address on your request'}</Text>
        </View>

        {passed ? (
          <View style={styles.warningCard} accessibilityRole="alert">
            <Text style={styles.warningTitle}>This time has passed</Text>
            <Text style={styles.warningText}>{SLOT_PASSED_COPY}</Text>
            {provider?.userId ? (
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => router.push(customerChatRoute(bookingId, provider.userId))}
                accessibilityRole="button"
                accessibilityLabel="Message the pro"
              >
                <Text style={styles.secondaryBtnText}>Message the pro</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.secondaryBtn} onPress={backToQuotes} accessibilityRole="button" accessibilityLabel="Back to quotes">
              <Text style={styles.secondaryBtnText}>Back to quotes</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.label}>What is included</Text>
          <Text style={styles.value}>{preview.description}</Text>
          {preview.couldChangeIf ? (
            <>
              <Text style={styles.label}>Could change if</Text>
              <Text style={styles.value}>{preview.couldChangeIf}</Text>
            </>
          ) : null}
        </View>

        <View style={styles.card} accessibilityLabel="Price">
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Pro's price</Text>
            <Text style={styles.rowValue}>{formatPHP(preview.quotedPrice)}</Text>
          </View>
          {preview.sukiDiscount > 0 ? (
            <View style={styles.row}>
              <Text style={[styles.rowLabel, styles.discount]}>Suki discount</Text>
              <Text style={[styles.rowValue, styles.discount]}>{`-${formatPHP(preview.sukiDiscount)}`}</Text>
            </View>
          ) : null}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Service fee</Text>
            <Text style={styles.rowValue}>{formatPHP(preview.serviceFee)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatPHP(preview.totalAmount)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Your wallet balance</Text>
            <Text style={styles.rowValue}>{formatPHP(preview.walletBalance)}</Text>
          </View>
        </View>

        {walletShort ? (
          <View style={styles.warningCard} accessibilityRole="alert">
            <AlertTriangle size={20} color={colors.warningDark} />
            <Text style={styles.warningTitle}>Your wallet does not cover the total</Text>
            <Text style={styles.warningText}>
              {`This booking costs ${formatPHP(preview.totalAmount)} and your wallet has ${formatPHP(preview.walletBalance)}. Card, GCash and Maya payments and wallet top-ups are not available yet, so your onService wallet must already cover the total before you can confirm.`}
            </Text>
          </View>
        ) : null}

        <View style={styles.card} accessibilityLabel="Cancellation">
          <Text style={styles.label}>Cancellation</Text>
          {policySummary ? (
            <Text style={styles.value}>{policySummary.intro}</Text>
          ) : policyQuery.isError ? (
            <Text style={styles.value}>The cancellation policy could not be loaded. Read it on the Terms page before you confirm.</Text>
          ) : (
            <ActivityIndicator size="small" color={colors.primary} />
          )}
          <TouchableOpacity
            onPress={() => router.push({ pathname: Routes.CUSTOMER.TERMS, params: { tab: 'terms' } })}
            style={styles.linkBtn}
            accessibilityRole="link"
            accessibilityLabel={policySummary?.linkLabel ?? 'Read the full cancellation policy'}
          >
            <Text style={styles.linkText}>{policySummary?.linkLabel ?? 'Read the full cancellation policy'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, !canConfirm && styles.disabled]}
          onPress={() => acceptMutation.mutate()}
          disabled={!canConfirm}
          accessibilityRole="button"
          accessibilityLabel="Confirm booking"
          accessibilityState={{ disabled: !canConfirm, busy: acceptMutation.isPending }}
        >
          {acceptMutation.isPending
            ? <ActivityIndicator color={colors.white} />
            : <Text style={styles.primaryBtnText}>Confirm booking</Text>}
        </TouchableOpacity>
        <Text style={styles.footnote}>Next, you pay from your wallet. The pro gets the job once your payment goes through.</Text>
      </ScrollView>
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
  card: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.base, gap: spacing.xs },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  providerCopy: { flex: 1, gap: 2 },
  providerName: { ...typography.h3, color: colors.text },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { ...typography.caption, color: colors.textSecondary },
  label: { ...typography.caption, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.xs },
  value: { ...typography.body, color: colors.text },
  emphasis: { ...typography.body, fontWeight: '700', color: colors.primary },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, minHeight: 28 },
  rowLabel: { ...typography.body, color: colors.textSecondary },
  rowValue: { ...typography.body, color: colors.text, fontWeight: '600' },
  discount: { color: colors.success },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  totalLabel: { ...typography.h3, color: colors.text },
  totalValue: { ...typography.price, color: colors.primary },
  warningCard: { backgroundColor: colors.warningLight, borderRadius: borderRadius.lg, padding: spacing.base, gap: spacing.sm },
  warningTitle: { ...typography.body, fontWeight: '700', color: colors.text },
  warningText: { ...typography.bodySmall, color: colors.text },
  linkBtn: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { ...typography.bodySmall, fontWeight: '700', color: colors.primary, textDecorationLine: 'underline' },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.lg, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { ...typography.button, color: colors.white },
  secondaryBtn: { minHeight: 44, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  secondaryBtnText: { ...typography.bodySmall, fontWeight: '700', color: colors.primary },
  disabled: { opacity: 0.5 },
  footnote: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
});
