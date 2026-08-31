import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { getBookingById, getMyDisputes } from '@/services/booking.service';
import { listBookingPhotos } from '@/services/booking-photo.service';
import { getBookingProofSummary } from '@/services/booking-proof.service';
import ProofSummaryCard from '@/components/booking/ProofSummaryCard';
// A7 — shared UI kit for loading + error states + toast feedback.
import { Button, Skeleton, ErrorState } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { formatPHP } from '@/utils/currency';
import { formatDateTime, formatBookingRef } from '@/utils/date';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
// Phase 14 Remediation #5 — Bug 909, 910 (cancel confirm), Bug 895 (status badge),
// Bug 906/907 (live indicator), Bug 902 (provider avatar) wired here.
import ConfirmModal from '@/components/ConfirmModal';
import StatusBadge from '@/components/StatusBadge';
import PulsingDot from '@/components/PulsingDot';
import Avatar from '@/components/Avatar';
import { useResponsive } from '@/hooks/useResponsive';
import { buildRoute, Routes } from '@/config/navigation';

const ACTIVE_STATUSES = new Set([
  'matched', 'paid', 'provider_en_route', 'provider_arrived', 'in_progress',
]);
const COMPLETED_STATUSES = new Set(['completed_by_provider', 'confirmed', 'payout_ready', 'paid_out', 'resolved']);
const CANCELLABLE_STATUSES = new Set([
  'requested', 'quoted', 'matched', 'payment_pending', 'paid', 'provider_en_route',
]);
const NEEDS_CONFIRMATION = 'completed_by_provider';

export default function BookingDetailScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isPhone } = useResponsive();
  const isWide = !isPhone;
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const { data: booking, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => getBookingById(id),
    enabled: !!id,
    staleTime: 30 * 1000,
  });

  // BUG-PHASE76-01 fix — pre-fix the `hasPhotos` flag (used to gate
  // the "View Job Photos" button) only checked the deprecated TEXT[]
  // arrays from migration 037. Photos uploaded via the canonical
  // /api/v1/uploads/booking-photo endpoint (Phase E CRIT-102 — used
  // by provider/job/[id]/complete and provider checklist) write ONLY
  // to booking_photos, not the legacy arrays. So a customer whose
  // provider used the new completion flow saw NO entry point to
  // their job photos. Same dual-source pattern as the Phase 71-03
  // provider-photos fix and Phase 56 customer photos.tsx fix.
  const photosCountQuery = useQuery({
    queryKey: ['bookingPhotos', id],
    queryFn: () => listBookingPhotos(id ?? ''),
    enabled: !!id,
    staleTime: 60 * 1000,
  });

  const proofSummaryQuery = useQuery({
    queryKey: ['bookingProofSummary', id],
    queryFn: () => getBookingProofSummary(id ?? ''),
    enabled: !!id,
    staleTime: 15 * 1000,
  });

  const disputeQuery = useQuery({
    queryKey: ['myDisputes', 'customer', id],
    queryFn: () => getMyDisputes(1, 1, id),
    enabled: !!id && ['completed_by_provider', 'confirmed', 'disputed', 'resolved'].includes(booking?.status ?? ''),
    staleTime: 15 * 1000,
  });
  const linkedDispute = disputeQuery.data?.disputes[0];

  const onRefresh = useCallback(() => {
    void refetch();
    void photosCountQuery.refetch();
    void disputeQuery.refetch();
    void proofSummaryQuery.refetch();
  }, [refetch, photosCountQuery, disputeQuery, proofSummaryQuery]);

  const cancelMutation = useMutation({
    mutationFn: async () => {
      await api.patch(`/api/v1/bookings/${id}/status`, {
        status: 'cancelled_by_customer',
        cancellationReason: cancelReason.trim() || undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['booking', id] });
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      void queryClient.invalidateQueries({ queryKey: ['activeBookings'] });
      void queryClient.invalidateQueries({ queryKey: ['bookingProofSummary', id] });
      setShowCancelForm(false);
      setCancelReason('');
      showToast('Booking cancelled. Check the booking payment details for any refund status and reference.', 'success');
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      showToast(getErrorMessage(err, 'Could not cancel booking.'), 'error');
    },
  });

  // Phase 14 Remediation #5 — Bug 998: ConfirmModal replaces Alert.alert
  // for the cancel-booking destructive action.
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const handleCancelConfirm = (): void => setShowCancelConfirm(true);

  if (!id) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Booking Details</Text>
        </View>
        <ErrorState
          title="Booking unavailable"
          message="This link does not identify a booking. Return to your bookings and open the record again."
          onRetry={() => router.back()}
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Booking Details</Text>
        </View>
        <View style={{ padding: spacing.base }}>
          <Skeleton width="100%" height={88} borderRadius={borderRadius.lg} style={{ marginBottom: spacing.base }} />
          <Skeleton width="55%" height={20} style={{ marginBottom: spacing.md }} />
          <Skeleton width="100%" height={120} borderRadius={borderRadius.lg} style={{ marginBottom: spacing.base }} />
          <Skeleton width="100%" height={120} borderRadius={borderRadius.lg} />
        </View>
      </View>
    );
  }

  if (error || !booking) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Booking Details</Text>
        </View>
        <ErrorState
          message="We couldn't load this booking. Please check your connection and try again."
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  const isActive = ACTIVE_STATUSES.has(booking.status);
  const needsConfirmation = booking.status === NEEDS_CONFIRMATION;
  const canCancel = CANCELLABLE_STATUSES.has(booking.status);
  // BUG-PHASE86-01 — payment_pending bookings (post-quote-accept or
  // any other path that lands here) need a "Complete Payment" entry
  // point. Pre-fix the booking detail showed only Cancel + Chat for
  // this state — there was no way for the customer to actually pay
  // for the quote they had just accepted.
  const needsPayment = booking.status === 'payment_pending';
  const canViewQuotes = booking.bookingType === 'quote_based' && ['requested', 'quoted'].includes(booking.status);
  const canViewChangeOrders = ['in_progress', 'completed_by_provider', 'confirmed'].includes(booking.status);
  const canFileDispute = ['completed_by_provider', 'confirmed'].includes(booking.status) && !linkedDispute;
  // BUG-PHASE76-01 — union legacy TEXT[] count + canonical
  // booking_photos count for the gate.
  const hasPhotos =
    (booking.providerBeforePhotos?.length ?? 0) > 0 ||
    (booking.providerAfterPhotos?.length ?? 0) > 0 ||
    (booking.jobPhotos?.length ?? 0) > 0 ||
    (photosCountQuery.data?.length ?? 0) > 0;

  const bookingActions = (
    <>
      {canViewQuotes && (
        <Button
          title="View Quotes"
          onPress={() => router.push({ pathname: Routes.CUSTOMER.BOOKING_QUOTES, params: { bookingId: id } })}
        />
      )}
      {needsPayment && (
        <Button
          title="Complete Payment"
          onPress={() => router.push({ pathname: Routes.CUSTOMER.BOOKING_PAY, params: { bookingId: id } })}
        />
      )}
      {isActive && (
        <Button
          title="Track Booking"
          onPress={() => router.push({ pathname: Routes.CUSTOMER.BOOKING_TRACKER, params: { bookingId: id } })}
        />
      )}
      {needsConfirmation && (
        <Button
          title="Confirm & Review"
          onPress={() => router.push({ pathname: Routes.CUSTOMER.BOOKING_COMPLETE, params: { bookingId: id } })}
        />
      )}
      {canViewChangeOrders && (
        <>
          <Button
            title="Parts & Materials / Change Orders"
            onPress={() => router.push({ pathname: Routes.CUSTOMER.BOOKING_CHANGE_ORDER, params: { bookingId: id } })}
            variant="outline"
          />
          <Text style={styles.changeOrderNote}>
            Extra parts or materials are handled here as a change order. Approval alone is not payment; continue only after the booking shows the added charge as paid and held.
          </Text>
        </>
      )}
      {hasPhotos && (
        <Button
          title="View Job Photos"
          onPress={() => router.push({ pathname: Routes.CUSTOMER.BOOKING_PHOTOS, params: { bookingId: id } })}
          variant="outline"
        />
      )}
      {(isActive || needsConfirmation) && booking.providerId && (
        <Button
          title="Chat with Provider"
          onPress={() => router.push(buildRoute(Routes.CUSTOMER.CHAT, { id: booking.id }))}
          variant="outline"
          style={styles.chatButton}
        />
      )}
      {canCancel && !showCancelForm && (
        <Button
          title="Cancel Booking"
          onPress={() => setShowCancelForm(true)}
          variant="ghost"
          style={styles.cancelButton}
        />
      )}
      {canCancel && showCancelForm && (
        <View style={styles.cancelForm}>
          <Text style={styles.cancelFormLabel}>Reason for cancellation (optional)</Text>
          <TextInput
            style={styles.cancelReasonInput}
            placeholder="Tell us why..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={2}
            // BUG-PHASE146-01 fix — match the server cancellationReason.max(500) contract.
            maxLength={500}
            value={cancelReason}
            onChangeText={setCancelReason}
            textAlignVertical="top"
            accessibilityLabel="Cancellation reason"
          />
          <Button
            title={cancelMutation.isPending ? 'Cancelling...' : 'Confirm Cancellation'}
            onPress={handleCancelConfirm}
            loading={cancelMutation.isPending}
            disabled={cancelMutation.isPending}
            style={styles.cancelConfirmBtn}
          />
          <TouchableOpacity
            onPress={() => { setShowCancelForm(false); setCancelReason(''); }}
            style={styles.cancelFormDismiss}
            accessibilityRole="button"
            accessibilityLabel="Keep booking"
          >
            <Text style={styles.cancelFormDismissText}>Never mind</Text>
          </TouchableOpacity>
        </View>
      )}
      {canFileDispute && (
        <Button
          title="File a Dispute"
          onPress={() => router.push({ pathname: Routes.CUSTOMER.BOOKING_DISPUTE, params: { bookingId: id } })}
          variant="ghost"
        />
      )}
      {linkedDispute && (
        <Button
          title="View Dispute Case"
          onPress={() => router.push(buildRoute(Routes.CUSTOMER.DISPUTE_DETAIL, { id: linkedDispute.id }))}
          variant="outline"
        />
      )}
      <Button
        title="Get Support"
        onPress={() => router.push({
          pathname: Routes.SUPPORT.NEW,
          params: {
            bookingId: id,
            type: 'booking_issue',
            subject: `Help with booking ${formatBookingRef(booking.id, booking.createdAt)}`,
          },
        })}
        variant="outline"
      />
      {COMPLETED_STATUSES.has(booking.status) && booking.status !== 'completed_by_provider' && (
        <View style={styles.completedActions}>
          <Button
            title="Leave a Review"
            onPress={() => router.push({ pathname: Routes.CUSTOMER.BOOKING_REVIEW, params: { bookingId: id } })}
            variant="outline"
          />
        </View>
      )}
    </>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Booking Details</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, isWide && styles.desktopScrollContent]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        <View style={styles.statusCard}>
          {/* Phase 14 Remediation #5 — Bug 895 status pill via StatusBadge */}
          <StatusBadge status={booking.status} />
          {/* Phase 14 Remediation #5 — Bug 906/907 live indicator on en-route */}
          {(booking.status === 'provider_en_route' || booking.status === 'provider_arrived') && (
            <PulsingDot />
          )}
          <Text style={styles.bookingId}>#{formatBookingRef(booking.id, booking.createdAt)}</Text>
        </View>

        <View
          style={[styles.detailLayout, isWide && styles.desktopDetailLayout]}
          accessibilityLabel="Booking details workspace"
        >
          <View style={styles.detailMain} accessibilityLabel="Booking service details">

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Service</Text>
          <Text style={styles.serviceName}>{booking.serviceName ?? booking.categoryName ?? 'Service'}</Text>
          {booking.description && <Text style={styles.serviceDesc}>{booking.description}</Text>}
        </View>

        {proofSummaryQuery.data && (
          <ProofSummaryCard summary={proofSummaryQuery.data} audience="customer" />
        )}
        {proofSummaryQuery.isError && (
          <View style={styles.proofError} accessibilityRole="alert">
            <Text style={styles.proofErrorTitle}>Work record unavailable</Text>
            <Text style={styles.proofErrorText}>Refresh to load checklist, evidence, and closeout status.</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Schedule</Text>
          <Text style={styles.detailText}>
            {booking.scheduledAt
              ? formatDateTime(booking.scheduledAt)
              : booking.bookingType === 'quote_based'
                ? 'To be agreed after you accept a quote'
                : 'Schedule not set'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          <Text style={styles.detailText}>
            {[booking.address, booking.barangay, booking.city].filter(Boolean).join(', ')}
          </Text>
        </View>

        {booking.providerName && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Provider</Text>
            <TouchableOpacity
              style={styles.providerRow}
              onPress={() => booking.providerId && router.push(buildRoute(Routes.CUSTOMER.PROVIDER_PROFILE, { id: booking.providerId }))}
              accessibilityRole="button"
              accessibilityLabel={`View provider ${booking.providerName}`}
            >
              {/* Phase 14 Remediation #5 — Bug 902 Avatar component with initials fallback */}
              <Avatar name={booking.providerName} size={48} />
              <Text style={styles.providerName}>{booking.providerName}</Text>
              <Text style={styles.providerArrow}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        {booking.completedAt && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Completed</Text>
            <Text style={styles.detailText}>{formatDateTime(booking.completedAt)}</Text>
          </View>
        )}
          </View>

          <View
            style={[styles.detailSidebar, isWide && styles.desktopDetailSidebar]}
            accessibilityLabel="Booking summary and actions"
          >

        {canViewQuotes ? (
          <View style={styles.receipt} accessibilityLabel="Quote pricing pending">
            <Text style={styles.receiptTitle}>Quote pricing</Text>
            <Text style={styles.quotePricingText}>
              No service price or payment is due yet. Compare provider quotes, then accept one to set the booking scope and total.
            </Text>
          </View>
        ) : (
        <View style={styles.receipt}>
          <Text style={styles.receiptTitle}>Receipt</Text>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Service Price</Text>
            <Text style={styles.receiptValue}>
              {/* servicePrice already bakes in surge and the suki discount.
                  Show the pre-surge, pre-discount base here so the separate
                  Surge (+) and Suki Discount (-) lines below don't double-count
                  and the line items reconcile to the Total. */}
              {formatPHP(booking.servicePrice + (booking.sukiDiscount ?? 0) - (booking.surgeAmount ?? 0))}
            </Text>
          </View>
          {(booking.sukiDiscount ?? 0) > 0 && (
            <View style={styles.receiptRow}>
              <Text style={[styles.receiptLabel, { color: colors.success }]}>Suki Discount</Text>
              <Text style={[styles.receiptValue, { color: colors.success }]}>-{formatPHP(booking.sukiDiscount)}</Text>
            </View>
          )}
          {/* BUG-PHASE45-01 fix — pre-fix the receipt hid surge pricing.
              When a booking is created during rush hours / holiday /
              peak hours, surgeMultiplier > 1 and surgeAmount > 0 are
              recorded on the booking, but the receipt showed only
              "Service Price + Platform Fee = Total" with no indication
              that surge was applied. Customers who paid more during a
              surge had no transparent breakdown. Now: when surge >0
              renders an extra line "Surge (×N.NN)" with the amount. */}
          {(booking.surgeAmount ?? 0) > 0 && (
            <View style={styles.receiptRow}>
              <Text style={[styles.receiptLabel, { color: colors.warning }]}>
                Surge {booking.surgeMultiplier ? `(×${booking.surgeMultiplier.toFixed(2)})` : ''}
              </Text>
              <Text style={[styles.receiptValue, { color: colors.warning }]}>
                +{formatPHP(booking.surgeAmount)}
              </Text>
            </View>
          )}
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Platform Fee</Text>
            <Text style={styles.receiptValue}>{formatPHP(booking.serviceFee)}</Text>
          </View>
          <View style={styles.receiptDivider} />
          <View style={styles.receiptRow}>
            <Text style={styles.receiptTotalLabel}>Total</Text>
            <Text style={styles.receiptTotalValue}>{formatPHP(booking.totalAmount)}</Text>
          </View>
          {booking.paymentMethod && (
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Payment Method</Text>
              <Text style={styles.receiptValue}>
                {booking.paymentMethod.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        )}
            {isWide && <View style={styles.desktopActions}>{bookingActions}</View>}
          </View>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {!isWide && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.base }]}>
          {bookingActions}
        </View>
      )}
      {/* Phase 14 Remediation #5 — Bug 998 cancel confirmation */}
      <ConfirmModal
        visible={showCancelConfirm}
        title="Cancel this booking?"
        message="Cancellation fees may apply if the provider is already en route. This action cannot be undone."
        confirmLabel="Yes, cancel"
        cancelLabel="Keep booking"
        destructive
        loading={cancelMutation.isPending}
        onConfirm={() => {
          cancelMutation.mutate();
          setShowCancelConfirm(false);
        }}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: 160 },
  desktopScrollContent: { padding: spacing.xl, paddingBottom: spacing.xl },
  errorText: { ...typography.body, color: colors.error, marginBottom: spacing.lg },

  statusCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  bookingId: { ...typography.caption, color: colors.textTertiary, fontWeight: '600' },
  detailLayout: { width: '100%' },
  desktopDetailLayout: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  detailMain: { flex: 1, minWidth: 0 },
  detailSidebar: { minWidth: 0 },
  desktopDetailSidebar: { width: 340 },
  desktopActions: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    gap: spacing.sm,
  },

  section: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  sectionTitle: { ...typography.caption, color: colors.textTertiary, fontWeight: '600', marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  serviceName: { ...typography.h3, color: colors.text },
  serviceDesc: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  detailText: { ...typography.body, color: colors.text },
  proofError: {
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  proofErrorTitle: { ...typography.bodySmall, color: colors.warningDark, fontWeight: '700' },
  proofErrorText: { ...typography.caption, color: colors.warningDark, marginTop: spacing.xs },

  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  providerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  providerInitial: { color: colors.white, fontWeight: '700', fontSize: 16 },
  providerName: { ...typography.body, color: colors.text, fontWeight: '600', flex: 1 },
  providerArrow: { fontSize: 22, color: colors.textTertiary },

  receipt: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.base,
  },
  receiptTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },
  quotePricingText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  receiptLabel: { ...typography.body, color: colors.textSecondary },
  receiptValue: { ...typography.body, color: colors.text, fontWeight: '500' },
  receiptDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  receiptTotalLabel: { ...typography.h3, color: colors.text },
  receiptTotalValue: { ...typography.price, color: colors.primary },

  bottomBar: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.sm,
  },
  chatButton: { marginTop: 0 },
  changeOrderNote: { ...typography.caption, color: colors.textTertiary, lineHeight: 16, marginTop: -spacing.xs },
  completedActions: { gap: spacing.sm },

  cancelButton: { marginTop: spacing.xs },
  cancelForm: {
    backgroundColor: colors.errorLight,
    padding: spacing.base,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  cancelFormLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  cancelReasonInput: {
    ...typography.body,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    minHeight: 60,
    color: colors.text,
  },
  cancelConfirmBtn: { backgroundColor: colors.error },
  cancelFormDismiss: { alignItems: 'center', paddingVertical: spacing.sm, minHeight: 44, justifyContent: 'center' },
  cancelFormDismissText: { ...typography.body, color: colors.textSecondary },
});
