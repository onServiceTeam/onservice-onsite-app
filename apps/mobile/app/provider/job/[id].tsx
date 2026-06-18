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
  Linking,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBookingById } from '@/services/booking.service';
import { updateBookingStatus } from '@/services/provider-api.service';
// A7 — shared UI kit for loading + error states + toast feedback.
import { Button, Skeleton, ErrorState, Card, SectionHeader, StatusBadge } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { formatPHP } from '@/utils/currency';
// Phase E CRIT-101 — commission table for tier-based net earnings.
import { platformConfig } from '@/config/platform.config';
import { formatDateTime, formatRelative, formatBookingRef } from '@/utils/date';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography, borderRadius, getCategoryTint } from '@/config/theme';
import { MapIcon, ChevronLeft } from '@/components/icons';
import { useLocation } from '@/hooks/useLocation';

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
};

const NEXT_STATUS: Record<string, { status: string; label: string; confirm?: string }> = {
  paid: { status: 'provider_en_route', label: 'Start Navigation', confirm: 'Are you heading to the job location?' },
  provider_en_route: { status: 'provider_arrived', label: 'I\'ve Arrived', confirm: 'Confirm you\'ve arrived at the location?' },
  provider_arrived: { status: 'in_progress', label: 'Start Service', confirm: 'Begin the service now?' },
  in_progress: { status: 'completed_by_provider', label: 'Mark Complete', confirm: 'Mark this job as complete? The customer will be asked to confirm.' },
};

export default function ProviderJobDetailScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { getCurrentLocation, isLoading: isGettingLocation } = useLocation();

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
  const providerMeQuery = useQuery<{ tier: string }>({
    queryKey: ['providerMe'],
    queryFn: async () => {
      const apiModule = await import('@/services/api');
      const res = await apiModule.default.get<{ data: { tier: string } }>('/api/v1/providers/me');
      return { tier: res.data.data.tier };
    },
    staleTime: 5 * 60 * 1000,
  });
  const providerTier = providerMeQuery.data?.tier ?? 'new';

  const statusMutation = useMutation({
    mutationFn: ({ newStatus, location }: { newStatus: string; location?: { latitude: number; longitude: number } }) =>
      updateBookingStatus(id, newStatus, undefined, location),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['booking', id] });
      void queryClient.invalidateQueries({ queryKey: ['providerJobs'] });
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

  const handleNavigate = async (): Promise<void> => {
    if (!booking?.latitude || !booking?.longitude) {
      showToast('No GPS coordinates available for this job.', 'warning');
      return;
    }
    const lat = booking.latitude;
    const lng = booking.longitude;
    const label = encodeURIComponent(booking.address);
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
    });
    if (url) {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        showToast('Could not open the maps application.', 'error');
      }
    }
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Job Details</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
          {booking.latitude && booking.longitude && (
            <TouchableOpacity onPress={handleNavigate} style={[styles.navigateButton, { backgroundColor: navTint.bg }]}>
              <View style={styles.navigateIconWrap}><MapIcon size={20} color={navTint.fg} /></View>
              <Text style={[styles.navigateText, { color: navTint.fg }]}>Open in Maps</Text>
            </TouchableOpacity>
          )}
        </Card>

        {/* Phase E CRIT-101 fix — Earnings section now shows the
             real breakdown: gross Service Price → tier-specific
             commission → NET earnings. Pre-fix "Your Earnings"
             showed the gross service price. */}
        {(() => {
          const tierRate =
            platformConfig.commissionRates[providerTier] ?? platformConfig.commissionRates.new ?? 0.15;
          const commissionAmount = Math.round(booking.servicePrice * tierRate);
          const net = booking.servicePrice - commissionAmount;
          const tierPct = Math.round(tierRate * 100);
          return (
            <Card style={styles.card}>
              <SectionHeader title="Earnings" />
              <View style={styles.earningsRow}>
                <Text style={styles.earningsLabel}>Service Price</Text>
                <Text style={styles.earningsValue}>
                  {formatPHP(booking.servicePrice)}
                </Text>
              </View>
              <View style={styles.earningsRow}>
                <Text style={styles.earningsLabel}>{`Platform commission (${tierPct}%)`}</Text>
                <Text style={styles.earningsValue}>
                  {`-${formatPHP(commissionAmount)}`}
                </Text>
              </View>
              <View style={styles.earningsDivider} />
              <View style={styles.earningsRow}>
                <Text style={styles.earningsTotalLabel}>Your Earnings</Text>
                <Text style={styles.earningsTotalValue}>
                  {formatPHP(net)}
                </Text>
              </View>
              <Text style={styles.earningsNote}>
                {`${tierPct}% commission deducted automatically when payment is released. Earn higher tier for lower commission.`}
              </Text>
            </Card>
          );
        })()}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.base }]}>
        {canSubmitQuote && (
          <Button
            title="Submit Quote"
            onPress={() => router.push(`/provider/job/${booking.id}/quote`)}
          />
        )}
        {nextAction && (
          <Button
            title={isGettingLocation ? 'Getting location...' : statusMutation.isPending ? 'Updating...' : nextAction.label}
            onPress={handleNextStatus}
            loading={statusMutation.isPending}
            disabled={statusMutation.isPending || cancelMutation.isPending || isGettingLocation}
          />
        )}
        {canSubmitChangeOrder && (
          <Button
            title="Submit Change Order"
            onPress={() => router.push(`/provider/job/${booking.id}/change-order`)}
            variant="outline"
          />
        )}
        {['in_progress', 'provider_arrived', 'provider_en_route'].includes(booking.status) && (
          <>
            <Button
              title="Job Checklist"
              onPress={() => router.push(`/provider/job/${booking.id}/checklist`)}
              variant="outline"
            />
            <Button
              title="Upload Before/After Photos"
              onPress={() => router.push(`/provider/job/${booking.id}/photos`)}
              variant="outline"
            />
          </>
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
        {/* BUG-PHASE67-01 fix — inline cancel-reason form (mirrors
            customer/booking/[id].tsx). Reason is sent to the server so
            the customer can see why their booking was cancelled. */}
        {canCancel && showCancelForm && (
          <View style={styles.cancelForm}>
            <Text style={styles.cancelFormLabel}>Reason for cancellation (optional)</Text>
            {/* BUG-PHASE146-01 fix — pre-fix this input had no
                maxLength. Server's updateBookingStatusSchema caps
                cancellationReason at 500 (booking.validators.ts:61).
                Same fix shape as the customer-side cancel reason
                (also fixed in Phase 146). */}
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
      </View>
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
