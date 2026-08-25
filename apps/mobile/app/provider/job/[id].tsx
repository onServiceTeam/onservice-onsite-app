import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBookingById, getMyDisputes } from '@/services/booking.service';
import { getBookingProofSummary } from '@/services/booking-proof.service';
import ProofSummaryCard from '@/components/booking/ProofSummaryCard';
import { updateBookingStatus } from '@/services/provider-api.service';
// A7 — shared UI kit for loading + error states + toast feedback.
import { Button, Skeleton, ErrorState, Card, SectionHeader, StatusBadge } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { formatPHP } from '@/utils/currency';
import { formatDateTime, formatRelative, formatBookingRef } from '@/utils/date';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography, borderRadius, getCategoryTint } from '@/config/theme';
import { MapIcon, ChevronLeft } from '@/components/icons';
import { useLocation } from '@/hooks/useLocation';
import { useResponsive } from '@/hooks/useResponsive';
import { buildRoute, Routes } from '@/config/navigation';

const STATUS_LABELS: Record<string, string> = {
  requested: 'New Request',
  quoted: 'Quote Sent',
  matched: 'Assigned to You',
  payment_pending: 'Awaiting Payment',
  paid: 'Payment Confirmed',
  provider_en_route: 'On Your Way',
  provider_arrived: 'You\'ve Arrived',
  in_progress: 'In Progress',
  completed_by_provider: 'Awaiting Confirmation',
  confirmed: 'Confirmed by Customer',
  payout_ready: 'Payout Ready',
  paid_out: 'Paid Out',
  disputed: 'Customer Dispute Open',
  resolved: 'Dispute Resolved',
};

// D27 Phase 2 — render a stored intake answer. Booking JSON only keeps the
// field_key, so turn `area_sqm` into `Area sqm` and booleans into Yes/No.
function humanizeKey(key: string): string {
  const s = key.replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatIntakeValue(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

const NEXT_STATUS: Record<string, { status: string; label: string; confirm?: string }> = {
  paid: { status: 'provider_en_route', label: 'Start Navigation', confirm: 'Are you heading to the job location?' },
  provider_en_route: { status: 'provider_arrived', label: 'I\'ve Arrived', confirm: 'Confirm you\'ve arrived at the location?' },
  provider_arrived: { status: 'in_progress', label: 'Start Service', confirm: 'Begin the service now?' },
  in_progress: { status: 'completed_by_provider', label: 'Review & Complete' },
};

export default function ProviderJobDetailScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { getCurrentLocation, isLoading: isGettingLocation } = useLocation();
  const { isPhone } = useResponsive();
  const navigationRoute = id
    ? buildRoute(Routes.PROVIDER.JOB_NAVIGATE, { id })
    : null;

  const { data: booking, isLoading, isError, refetch } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => getBookingById(id),
    enabled: !!id,
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  });

  // Phase E CRIT-101 fix — fetch the provider's tier so the
  // "Your Earnings" line shows the NET amount (after tier-specific
  // commission), not the gross service price. Pre-fix the screen
  // displayed `formatPHP(booking.servicePrice)` for both rows so
  // the provider thought they'd receive the full price and got
  // surprised at payout time.
  const providerMeQuery = useQuery<{ tier: string; commissionRate: number }>({
    queryKey: ['providerMe'],
    queryFn: async () => {
      const apiModule = await import('@/services/api');
      const res = await apiModule.default.get<{ data: { tier: string; commissionRate: number } }>('/api/v1/providers/me');
      return { tier: res.data.data.tier, commissionRate: res.data.data.commissionRate };
    },
    staleTime: 5 * 60 * 1000,
  });
  const proofSummaryQuery = useQuery({
    queryKey: ['bookingProofSummary', id],
    queryFn: () => getBookingProofSummary(id ?? ''),
    enabled: !!id,
    staleTime: 15 * 1000,
  });
  const disputeQuery = useQuery({
    queryKey: ['myDisputes', 'provider', id],
    queryFn: () => getMyDisputes(1, 1, id),
    enabled: !!id && ['disputed', 'resolved'].includes(booking?.status ?? ''),
    staleTime: 15 * 1000,
  });
  const linkedDispute = disputeQuery.data?.disputes[0];
  const providerTier = providerMeQuery.data?.tier;

  const statusMutation = useMutation({
    mutationFn: ({ newStatus, location }: { newStatus: string; location?: { latitude: number; longitude: number } }) =>
      updateBookingStatus(id, newStatus, undefined, location),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['booking', id] });
      void queryClient.invalidateQueries({ queryKey: ['providerJobs'] });
      void queryClient.invalidateQueries({ queryKey: ['bookingProofSummary', id] });
      if (variables.newStatus === 'provider_en_route' && navigationRoute) {
        router.push(navigationRoute as never);
      }
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      showToast(getErrorMessage(err, 'Failed to update status.'), 'error');
    },
  });

  // BUG-PHASE67-01 fix — pre-fix the provider cancel mutation always
  // sent the hardcoded reason "Provider cancelled" without ever asking
  // the provider WHY. Customer side captures the reason via an inline
  // form (booking/[id].tsx); now provider side does the same. The
  // captured reason is sent through to the server (which records it on
  // the booking and surfaces it to the customer in their booking
  // detail). Same pattern caught in earlier audit phases (Phase 41
  // RecurringPage, Phase 41 BusinessAccountsPage, Phase 39 admin
  // cancel-booking). Customer-side cancellation reason is read at
  // booking/[id].tsx:70.
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const cancelMutation = useMutation({
    mutationFn: () =>
      updateBookingStatus(
        id,
        'cancelled_by_provider',
        cancelReason.trim() || 'Provider cancelled',
      ),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['booking', id] });
      void queryClient.invalidateQueries({ queryKey: ['providerJobs'] });
      setShowCancelForm(false);
      setCancelReason('');
      showToast(result.warning ? result.warning.message : 'Job has been cancelled.', 'success');
      router.back();
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      showToast(getErrorMessage(err, 'Failed to cancel.'), 'error');
    },
  });

  const handleNextStatus = (): void => {
    if (!booking) return;
    const next = NEXT_STATUS[booking.status];
    if (!next) return;

    if (next.status === 'completed_by_provider') {
      router.push(buildRoute(Routes.PROVIDER.JOB_COMPLETE, { id: booking.id }) as never);
      return;
    }

    const submitNextStatus = async (): Promise<void> => {
      let location: { latitude: number; longitude: number } | undefined;
      if (next.status === 'provider_arrived') {
        location = await getCurrentLocation() ?? undefined;
        if (!location) return;
      }
      statusMutation.mutate({ newStatus: next.status, location });
    };

    if (next.confirm) {
      Alert.alert('Confirm', next.confirm, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes', onPress: () => { void submitNextStatus(); } },
      ]);
    } else {
      void submitNextStatus();
    }
  };

  const handleCancel = (): void => {
    // BUG-PHASE67-01 fix — open inline reason-capture form instead of
    // immediately firing the mutation with a hardcoded reason.
    setShowCancelForm(true);
  };

  const handleNavigate = (): void => {
    if (!navigationRoute) return;
    router.push(navigationRoute as never);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Job Details</Text>
        </View>
        <View style={{ padding: spacing.base }}>
          <Skeleton width="100%" height={88} borderRadius={borderRadius.lg} style={{ marginBottom: spacing.base }} />
          <Skeleton width="55%" height={20} style={{ marginBottom: spacing.md }} />
          <Skeleton width="100%" height={130} borderRadius={borderRadius.lg} style={{ marginBottom: spacing.base }} />
          <Skeleton width="100%" height={130} borderRadius={borderRadius.lg} />
        </View>
      </View>
    );
  }

  if (isError || !booking) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Job Details</Text>
        </View>
        <ErrorState
          message="We couldn't load this job. Please check your connection and try again."
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  const nextAction = NEXT_STATUS[booking.status];
  // App design refresh — soft per-category accent for the "Open in Maps"
  // action chip; falls back to brand teal for unknown categories.
  const navTint = getCategoryTint(booking.categoryName);
  const canCancel = ['matched', 'paid', 'provider_en_route'].includes(booking.status);
  const isActiveJob = ['paid', 'provider_en_route', 'provider_arrived', 'in_progress'].includes(booking.status);
  const canSubmitQuote = booking.bookingType === 'quote_based' && booking.status === 'requested';
  const canSubmitChangeOrder = booking.status === 'in_progress';
  const hasJobDestination = (
    booking.latitude != null && booking.longitude != null
  ) || [booking.address, booking.barangay, booking.city, booking.province].some(Boolean);
  const tierRate = providerMeQuery.data?.commissionRate;
  const commissionAmount = tierRate == null ? null : Math.round(booking.servicePrice * tierRate);
  const netEarnings = commissionAmount == null ? null : booking.servicePrice - commissionAmount;
  const tierPct = tierRate == null ? null : Math.round(tierRate * 100);

  const earningsCard = (
    <Card style={styles.card}>
      <SectionHeader title="Earnings" />
      <View style={styles.earningsRow}>
        <Text style={styles.earningsLabel}>Service Price</Text>
        <Text style={styles.earningsValue}>{formatPHP(booking.servicePrice)}</Text>
      </View>
      {tierPct != null && commissionAmount != null && netEarnings != null && providerTier ? (
        <>
          <View style={styles.earningsRow}>
            <Text style={styles.earningsLabel}>{`Platform commission (${tierPct}%)`}</Text>
            <Text style={styles.earningsValue}>{`-${formatPHP(commissionAmount)}`}</Text>
          </View>
          <View style={styles.earningsDivider} />
          <View style={styles.earningsRow}>
            <Text style={styles.earningsTotalLabel}>Your Earnings</Text>
            <Text style={styles.earningsTotalValue}>{formatPHP(netEarnings)}</Text>
          </View>
          <Text style={styles.earningsNote}>
            {`${tierPct}% live commission for your ${providerTier} tier, applied when payment is released.`}
          </Text>
        </>
      ) : (
        <Text style={styles.earningsNote}>Net earnings preview is unavailable. Refresh before relying on a commission estimate.</Text>
      )}
    </Card>
  );

  const actionPanel = (
    <>
      {linkedDispute && (
        <Button
          title={linkedDispute.providerRespondedAt ? 'View Dispute Case' : 'Respond to Dispute'}
          onPress={() => router.push(buildRoute(Routes.PROVIDER.DISPUTE_DETAIL, { id: linkedDispute.id }))}
        />
      )}
      {canSubmitQuote && (
        <Button
          title="Submit Quote"
          onPress={() => router.push(buildRoute(Routes.PROVIDER.QUOTE_BUILDER, { id: booking.id }) as never)}
        />
      )}
      {nextAction && booking.status !== 'in_progress' && (
        <Button
          title={isGettingLocation ? 'Getting location...' : statusMutation.isPending ? 'Updating...' : nextAction.label}
          onPress={handleNextStatus}
          loading={statusMutation.isPending}
          disabled={statusMutation.isPending || cancelMutation.isPending || isGettingLocation}
        />
      )}
      {canSubmitChangeOrder && (
        <>
          <Button
            title="Submit Change Order (Parts / Materials)"
            onPress={() => router.push(buildRoute(Routes.PROVIDER.JOB_CHANGE_ORDER, { id: booking.id }) as never)}
            variant="outline"
          />
          <Text style={styles.changeOrderNote}>
            Need extra parts or materials? Send a change order before you buy or do extra work. Approval alone is not payment; continue only after the job shows the added charge as paid and held.
          </Text>
        </>
      )}
      {['in_progress', 'provider_arrived', 'provider_en_route'].includes(booking.status) && (
        <>
          <Button
            title="Job Checklist"
            onPress={() => router.push(buildRoute(Routes.PROVIDER.JOB_CHECKLIST, { id: booking.id }) as never)}
            variant="outline"
          />
          <Button
            title="Upload Before/After Photos"
            onPress={() => router.push(buildRoute(Routes.PROVIDER.JOB_PHOTOS, { id: booking.id }) as never)}
            variant="outline"
          />
        </>
      )}
      {nextAction && booking.status === 'in_progress' && (
        <Button
          title={nextAction.label}
          onPress={handleNextStatus}
          disabled={statusMutation.isPending || cancelMutation.isPending}
        />
      )}
      {isActiveJob && (
        <Button
          title="Chat with Customer"
          onPress={() => router.push(`/provider/chat/${booking.id}`)}
          variant="outline"
        />
      )}
      {canCancel && !showCancelForm && (
        <Button
          title="Cancel Job"
          onPress={handleCancel}
          variant="ghost"
          disabled={cancelMutation.isPending || statusMutation.isPending}
        />
      )}
      {canCancel && showCancelForm && (
        <View style={styles.cancelForm}>
          <Text style={styles.cancelFormLabel}>Reason for cancellation (optional)</Text>
          {/* BUG-PHASE146-01 fix — keep the client cap aligned with the
              server's 500-character cancellationReason limit. */}
          <TextInput
            style={styles.cancelReasonInput}
            placeholder="Tell the customer why..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={2}
            maxLength={500}
            value={cancelReason}
            onChangeText={setCancelReason}
            textAlignVertical="top"
          />
          <Button
            title={cancelMutation.isPending ? 'Cancelling...' : 'Confirm Cancellation'}
            onPress={() => cancelMutation.mutate()}
            loading={cancelMutation.isPending}
            disabled={cancelMutation.isPending}
          />
          <TouchableOpacity
            onPress={() => { setShowCancelForm(false); setCancelReason(''); }}
            style={styles.cancelFormDismiss}
          >
            <Text style={styles.cancelFormDismissText}>Never mind</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Job Details</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, !isPhone && styles.scrollContentWide]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[styles.jobWorkspace, !isPhone && styles.jobWorkspaceWide]}
          accessibilityLabel={isPhone ? 'Provider job details' : 'Provider job execution workspace'}
        >
        <View style={styles.jobRecord} accessibilityLabel="Job service and customer context">
        <View style={styles.statusCard}>
          <StatusBadge status={booking.status} size="md" />
          <Text style={styles.bookingId}>#{formatBookingRef(booking.id, booking.createdAt)}</Text>
        </View>

        <Text style={styles.statusMessage}>
          {STATUS_LABELS[booking.status] ?? booking.status.replace(/_/g, ' ')}
        </Text>

        <Card style={styles.card}>
          <SectionHeader title="Service" />
          <Text style={styles.serviceName}>{booking.serviceName ?? booking.categoryName ?? 'Service'}</Text>
          {booking.description && <Text style={styles.serviceDesc}>{booking.description}</Text>}
        </Card>

        {proofSummaryQuery.data && (
          <ProofSummaryCard summary={proofSummaryQuery.data} audience="provider" />
        )}
        {proofSummaryQuery.isError && (
          <View style={styles.proofError} accessibilityRole="alert">
            <Text style={styles.proofErrorTitle}>Proof status unavailable</Text>
            <Text style={styles.proofErrorText}>Refresh before relying on the completion checklist and photo count.</Text>
          </View>
        )}

        {/* D27 Phase 2 — structured job details the customer answered on the
            custom-quote intake form. Keyed by field_key; the readable label is
            derived from the key. Helps the provider quote accurately. */}
        {booking.intakeAnswers && Object.keys(booking.intakeAnswers).length > 0 && (
          <Card style={styles.card}>
            <SectionHeader title="Job details" />
            {Object.entries(booking.intakeAnswers).map(([key, value]) => (
              <View key={key} style={styles.intakeRow}>
                <Text style={styles.intakeKey}>{humanizeKey(key)}</Text>
                <Text style={styles.intakeValue}>{formatIntakeValue(value)}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* BUG-PHASE80-01 fix — pre-fix the provider job detail
            screen had no Customer section. Provider had to remember
            who they were serving from a different screen (or open
            chat) to know. Phase 77 added customerName to the
            booking response; surface it here as a top-of-mind
            section so the provider sees who the booking is for. */}
        {booking.customerName && (
          <Card style={styles.card}>
            <SectionHeader title="Customer" />
            <Text style={styles.detailText}>{booking.customerName}</Text>
          </Card>
        )}

        <Card style={styles.card}>
          <SectionHeader title="Schedule" />
          <Text style={styles.detailText}>{formatDateTime(booking.scheduledAt)}</Text>
          <Text style={styles.relativeText}>{formatRelative(booking.scheduledAt)}</Text>
        </Card>

        <Card style={styles.card}>
          <SectionHeader title="Location" />
          <Text style={styles.detailText}>
            {[booking.address, booking.barangay, booking.city].filter(Boolean).join(', ')}
          </Text>
          {hasJobDestination && (
            <TouchableOpacity
              onPress={handleNavigate}
              style={[styles.navigateButton, { backgroundColor: navTint.bg }]}
              accessibilityRole="button"
              accessibilityLabel="Directions and arrival"
            >
              <View style={styles.navigateIconWrap}><MapIcon size={20} color={navTint.fg} /></View>
              <Text style={[styles.navigateText, { color: navTint.fg }]}>Directions &amp; arrival</Text>
            </TouchableOpacity>
          )}
        </Card>
        {isPhone && earningsCard}
        </View>

        {!isPhone && (
          <View style={styles.jobSidebar} accessibilityLabel="Job earnings and actions">
            {earningsCard}
            <View style={styles.actionPanelWide}>{actionPanel}</View>
          </View>
        )}
        </View>
      </ScrollView>

      {isPhone && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.base }]}>
          {actionPanel}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  centered: { alignItems: 'center', justifyContent: 'center' },
  errorText: { ...typography.body, color: colors.error, marginBottom: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: 160 },
  scrollContentWide: { padding: spacing.xl, paddingBottom: spacing.xl },
  jobWorkspace: { width: '100%' },
  jobWorkspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  jobRecord: { flex: 1, minWidth: 0 },
  jobSidebar: { width: 340, minWidth: 0 },
  actionPanelWide: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    gap: spacing.sm,
  },

  statusCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  bookingId: { ...typography.caption, color: colors.textTertiary, fontWeight: '600' },
  statusMessage: { ...typography.h2, color: colors.text, marginBottom: spacing.lg },

  card: { marginBottom: spacing.base },
  serviceName: { ...typography.h3, color: colors.text },
  serviceDesc: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  proofError: {
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  proofErrorTitle: { ...typography.bodySmall, color: colors.warningDark, fontWeight: '700' },
  proofErrorText: { ...typography.caption, color: colors.warningDark, marginTop: spacing.xs },
  intakeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.xs },
  intakeKey: { ...typography.bodySmall, color: colors.textSecondary, flexShrink: 1 },
  intakeValue: { ...typography.body, color: colors.text, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  detailText: { ...typography.body, color: colors.text },
  relativeText: { ...typography.bodySmall, color: colors.textTertiary, marginTop: 2 },

  navigateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: spacing.sm,
  },
  navigateIcon: { fontSize: 20, marginRight: spacing.sm },
  navigateIconWrap: { marginRight: spacing.sm, alignItems: 'center' as const },
  navigateText: { ...typography.body, color: colors.secondary, fontWeight: '600' },

  earningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  earningsLabel: { ...typography.body, color: colors.textSecondary },
  earningsValue: { ...typography.body, color: colors.text, fontWeight: '500' },
  earningsDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  earningsTotalLabel: { ...typography.h3, color: colors.text },
  earningsTotalValue: { ...typography.price, color: colors.secondary },
  earningsNote: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },

  bottomBar: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.sm,
  },
  changeOrderNote: { ...typography.caption, color: colors.textTertiary, lineHeight: 16, marginTop: -spacing.xs },

  // BUG-PHASE67-01 fix — cancel reason form styles (mirrors customer
  // booking/[id].tsx).
  cancelForm: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  cancelFormLabel: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' as const },
  cancelReasonInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    minHeight: 64,
    color: colors.text,
    backgroundColor: colors.backgroundSecondary,
  },
  cancelFormDismiss: { alignItems: 'center' as const, paddingVertical: spacing.sm },
  cancelFormDismissText: { ...typography.bodySmall, color: colors.textTertiary },
});
