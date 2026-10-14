import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getBookingById } from '@/services/booking.service';
import { Button, SkeletonCard, Card, TrustStrip, ErrorState } from '@/components/ui';
import { formatPHP } from '@/utils/currency';
import { formatDate, formatDateTime, formatBookingRef } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Lock, Check } from '@/components/icons';
import { useResponsive } from '@/hooks/useResponsive';
import { isQuoteTimeWindow, timeWindowLabel } from '@/services/request.service';

import { buildRoute, Routes } from '@/config/navigation';

/**
 * R-CUS-09: when the visit is, for a booking whose pro is already chosen.
 * A quote booking stores the start of its agreed window as scheduledAt plus
 * the window itself, so it reads "October 15, 2026, morning (8 AM to 12 PM)".
 * Other bookings read as a date and time. Null when no time is stored.
 */
function visitTimeText(scheduledAt: string | null | undefined, scheduledWindow: string | null | undefined): string | null {
  if (!scheduledAt) return null;
  if (isQuoteTimeWindow(scheduledWindow)) {
    const label = timeWindowLabel(scheduledWindow);
    return `${formatDate(scheduledAt)}, ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
  }
  return formatDateTime(scheduledAt);
}

export default function BookingConfirmScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();

  const { data: booking, isLoading, isError, refetch } = useQuery({
    queryKey: ['bookingDetail', bookingId],
    queryFn: () => getBookingById(bookingId ?? ''),
    enabled: !!bookingId,
  });

  const isPaymentHeld = booking?.escrowStatus === 'held';
  const isPaid = booking?.status === 'paid';
  const isConfirmationStage = booking?.status === 'payment_pending' || isPaid;
  const statusLabel = booking?.status
    ? booking.status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
    : '';
  // R-CUS-09: under D38 the pro is chosen when the customer accepts a quote
  // (acceptQuote sets provider_id), so most bookings reach this screen with
  // their pro already assigned. Only a booking without one is still matched.
  const hasAssignedProvider = !!booking?.providerId;
  const assignedProviderName = booking?.providerName?.trim() || null;
  // The pro's name at the start of a sentence and inside one.
  const providerLabel = assignedProviderName ?? 'Your provider';
  const providerInSentence = assignedProviderName ?? 'your provider';
  const visitTime = visitTimeText(booking?.scheduledAt, booking?.scheduledWindow);
  const providerOrMatchingText = !hasAssignedProvider
    ? 'We\'re finding the best provider for you.'
    : assignedProviderName
      ? `${assignedProviderName} is your provider for this job.`
      : 'Your provider is already assigned to this job.';
  const titleText = !isConfirmationStage
    ? 'Booking Status Updated'
    : isPaid
      ? 'Booking Confirmed!'
      : 'Booking Submitted!';
  const subtitleText = !isConfirmationStage
    ? `This booking is now ${statusLabel}. Open the booking record for its current actions and support history.`
    : isPaid
      ? isPaymentHeld
        ? `Your booking shows paid with escrow held. ${providerOrMatchingText}`
        : `Your booking shows paid. ${providerOrMatchingText}`
      : 'Complete your payment to confirm this booking.';
  // R-NOT-01 tells the pro in the app (inbox and live update) when the
  // customer pays. Android push is not set up yet, so the copy says "in the
  // app" and never promises a phone notification.
  // Release order: these lines are true only once the R-NOT-01 API change
  // (notifyProviderCustomerPaid in the wallet and webhook payment routes) is
  // live. Deploy that API change first, or in the same release, and check it
  // is live before publishing a web build or APK that carries this copy.
  const nextSteps: string[] = !hasAssignedProvider
    ? [
      'We\'ll match you with a verified provider in your area',
      'You\'ll receive a notification once a provider accepts',
      'Track your provider\'s status in real-time on booking day',
    ]
    : isPaid
      ? [
        visitTime
          ? `${providerLabel} is coming on ${visitTime}`
          : `Check the booking for the visit time with ${providerInSentence}`,
        `${providerLabel} is notified in the app that you have paid`,
        'Track your provider\'s status in real-time on booking day',
      ]
      : [
        visitTime
          ? `Pay to confirm ${providerInSentence} for ${visitTime}`
          : `Pay to confirm ${providerInSentence} for this job`,
        `Once you pay, ${providerInSentence} is notified in the app`,
        'Track your provider\'s status in real-time on booking day',
      ];

  if (!bookingId || isError) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.xxl }]}>
        <View style={[styles.stateContent, !isPhone && styles.stateContentWide]}>
          <ErrorState
            message={
              bookingId
                ? "We couldn't verify this booking. Check My Bookings before paying or submitting another request."
                : 'No booking was provided. Open My Bookings to check your current requests.'
            }
            onRetry={bookingId ? () => void refetch() : () => router.replace(Routes.TABS.BOOKINGS)}
          />
        </View>
      </View>
    );
  }

  if (isLoading || !booking) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.xxl }]}>
        <View style={[styles.stateContent, !isPhone && styles.stateContentWide]}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.base },
      ]}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, !isPhone && styles.scrollContentWide]}
        showsVerticalScrollIndicator={false}
        accessibilityLabel={isPhone ? 'Booking confirmation' : 'Desktop booking confirmation workspace'}
      >
      <View style={styles.content}>
        <View style={styles.successCircle}>
          <Check size={40} color={colors.white} />
        </View>

        <Text style={styles.title}>{titleText}</Text>
        <Text style={styles.subtitle}>{subtitleText}</Text>

        {bookingId && (
          <View style={styles.bookingIdCard}>
            <Text style={styles.bookingIdLabel}>Booking ID</Text>
            <Text style={styles.bookingIdValue}>#{formatBookingRef(bookingId)}</Text>
          </View>
        )}

        {booking && (
          <Card style={styles.detailsCard}>
            {booking.categoryName && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Service</Text>
                <Text style={styles.detailValue}>{booking.categoryName}</Text>
              </View>
            )}
            {booking.scheduledAt && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Scheduled</Text>
                <Text style={styles.detailValue}>{formatDate(booking.scheduledAt)}</Text>
              </View>
            )}
            {booking.address && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Location</Text>
                <Text style={styles.detailValue} numberOfLines={2}>{booking.address}</Text>
              </View>
            )}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Total</Text>
              <Text style={[styles.detailValue, { fontWeight: '700' }]}>{formatPHP(booking.totalAmount)}</Text>
            </View>
          </Card>
        )}

        <TrustStrip style={styles.trustStrip} />

        {/* Show escrow only when the booking response actually reports held.
            E18 means release cannot be described as confirmation-only. */}
        {booking && isPaymentHeld && (
          <TouchableOpacity
            style={styles.infoCard}
            onPress={() => router.push(Routes.CUSTOMER.SAFETY)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Learn about payment, escrow, and booking support"
          >
            <View style={styles.infoIconWrap}><Lock size={22} color={colors.primary} /></View>
            <Text style={styles.infoText}>
              This booking currently shows escrow held. Release follows customer confirmation or the platform completion timer; check the booking for its current status.
            </Text>
          </TouchableOpacity>
        )}

        {isConfirmationStage ? (
          <Card style={styles.stepsCard}>
            <Text style={styles.stepsTitle}>What happens next?</Text>
            {nextSteps.map((step) => (
              <View key={step} style={styles.step}>
                <View style={styles.stepDot} />
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </Card>
        ) : null}
      </View>
      </ScrollView>

      <View style={[styles.actions, !isPhone && styles.actionsWide]}>
        {/* BUG-PHASE104-01 fix — pre-fix: when the booking landed here
            in payment_pending (because the PayMongo checkout failed,
            was cancelled, or the user backed out of GCash/Maya), the
            screen TOLD the user to "Complete your payment to confirm
            this booking" but offered no button to do so. They had to
            tap "View Booking" and then find "Complete Payment" on the
            booking detail screen — two taps where one should do. Now
            we surface the direct CTA when status is payment_pending. */}
        {bookingId && booking?.status === 'payment_pending' && (
          <Button
            title="Complete Payment"
            onPress={() => router.replace({ pathname: Routes.CUSTOMER.BOOKING_PAY, params: { bookingId } })}
            style={styles.primaryAction}
          />
        )}
        <Button
          title="View Booking"
          onPress={() => {
            if (bookingId) {
              router.replace(buildRoute(Routes.CUSTOMER.BOOKING_DETAIL, { id: bookingId }));
            } else {
              router.replace(Routes.TABS.BOOKINGS);
            }
          }}
          style={styles.primaryAction}
          variant={booking && !isPaid ? 'outline' : undefined}
        />
        <Button
          title="Back to Home"
          onPress={() => router.replace(Routes.TABS.HOME)}
          variant="outline"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.lg,
  },
  scroll: { flex: 1, width: '100%' },
  scrollContent: { flexGrow: 1, paddingBottom: spacing.lg },
  scrollContentWide: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  content: { flex: 1, alignItems: 'center' },
  stateContent: { flex: 1, width: '100%', gap: spacing.md },
  stateContentWide: { maxWidth: 760, alignSelf: 'center', justifyContent: 'center' },
  loadingIndicator: { marginBottom: spacing.lg },

  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  checkmark: { fontSize: 40, color: colors.white, fontWeight: '700' },

  title: {
    ...typography.h1,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },

  bookingIdCard: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  bookingIdLabel: { ...typography.caption, color: colors.primary },
  bookingIdValue: { ...typography.h3, color: colors.primary, marginTop: 2 },

  errorBanner: {
    backgroundColor: colors.errorLight,
    borderRadius: borderRadius.md,
    padding: spacing.base,
    width: '100%',
    marginBottom: spacing.lg,
  },
  errorText: { ...typography.bodySmall, color: colors.error, textAlign: 'center' as const },

  detailsCard: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  trustStrip: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  detailRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: spacing.xs,
  },
  detailLabel: { ...typography.bodySmall, color: colors.textSecondary },
  detailValue: { ...typography.bodySmall, color: colors.text, textAlign: 'right' as const, maxWidth: '60%' },

  infoCard: {
    flexDirection: 'row' as const,
    backgroundColor: colors.primaryLight,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  infoIcon: { fontSize: 20, marginRight: spacing.sm },
  infoIconWrap: { marginRight: spacing.sm, alignItems: 'center' as const },
  infoText: { ...typography.bodySmall, color: colors.primary, flex: 1 },

  stepsCard: {
    width: '100%',
  },
  stepsTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 6,
    marginRight: spacing.md,
  },
  stepText: { ...typography.body, color: colors.textSecondary, flex: 1 },

  actions: { gap: spacing.md },
  actionsWide: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  primaryAction: { marginBottom: 0 },
});
