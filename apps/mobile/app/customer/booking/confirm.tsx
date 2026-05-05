import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getBookingById } from '@/services/booking.service';
import { Button } from '@/components/ui';
import { formatPHP } from '@/utils/currency';
import { formatDate, formatBookingRef } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Lock } from '@/components/icons';

import { Routes } from '@/config/navigation';
export default function BookingConfirmScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();

  const { data: booking, isLoading, isError } = useQuery({
    queryKey: ['bookingDetail', bookingId],
    queryFn: () => getBookingById(bookingId ?? ''),
    enabled: !!bookingId,
  });

  const isPaid = booking?.status === 'paid' || booking?.escrowStatus === 'held';
  const titleText = isPaid ? 'Booking Confirmed!' : 'Booking Submitted!';
  const subtitleText = isPaid
    ? 'Your payment is secured. We\'re finding the best provider for you.'
    : 'Complete your payment to confirm this booking.';

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.base },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.successCircle}>
          <Text style={styles.checkmark}>✓</Text>
        </View>

        <Text style={styles.title}>{titleText}</Text>
        <Text style={styles.subtitle}>{subtitleText}</Text>

        {bookingId && (
          <View style={styles.bookingIdCard}>
            <Text style={styles.bookingIdLabel}>Booking ID</Text>
            <Text style={styles.bookingIdValue}>#{formatBookingRef(bookingId)}</Text>
          </View>
        )}

        {isLoading && <ActivityIndicator size="small" color={colors.primary} style={styles.loadingIndicator} />}

        {isError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>
              Could not load booking details. Your booking was created — check My Bookings.
            </Text>
          </View>
        )}

        {booking && (
          <View style={styles.detailsCard}>
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
          </View>
        )}

        {/* Bug 834 — Phase 14 D04 SiguradoShield pull. Strips trademark; */}
        {/* the escrow guarantee is verifiable on its own. Tap target leads */}
        {/* to /customer/safety-and-support for users curious about safety. */}
        <TouchableOpacity
          style={styles.infoCard}
          onPress={() => router.push(Routes.CUSTOMER.SAFETY)}
          activeOpacity={0.7}
        >
          <View style={styles.infoIconWrap}><Lock size={22} color={colors.primary} /></View>
          <Text style={styles.infoText}>
            Your payment is secured in escrow and will only be released when you confirm
            the job is done to your satisfaction.
          </Text>
        </TouchableOpacity>

        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>What happens next?</Text>
          <View style={styles.step}>
            <View style={styles.stepDot} />
            <Text style={styles.stepText}>
              We'll match you with a verified provider in your area
            </Text>
          </View>
          <View style={styles.step}>
            <View style={styles.stepDot} />
            <Text style={styles.stepText}>
              You'll receive a notification once a provider accepts
            </Text>
          </View>
          <View style={styles.step}>
            <View style={styles.stepDot} />
            <Text style={styles.stepText}>
              Track your provider's status in real-time on booking day
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        {/* BUG-PHASE104-01 fix — pre-fix: when the booking landed here
            in payment_pending (because the PayMongo checkout failed,
            was cancelled, or the user backed out of GCash/Maya), the
            screen TOLD the user to "Complete your payment to confirm
            this booking" but offered no button to do so. They had to
            tap "View Booking" and then find "Complete Payment" on the
            booking detail screen — two taps where one should do. Now
            we surface the direct CTA when status is payment_pending. */}
        {bookingId && booking && !isPaid && (
          <Button
            title="Complete Payment"
            onPress={() => router.replace(`/customer/booking/pay?bookingId=${bookingId}`)}
            style={styles.primaryAction}
          />
        )}
        <Button
          title="View Booking"
          onPress={() => {
            if (bookingId) {
              router.replace(`/customer/booking/${bookingId}`);
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
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  content: { flex: 1, alignItems: 'center' },
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
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.base,
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
    backgroundColor: colors.successLight,
    padding: spacing.base,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
  },
  infoIcon: { fontSize: 20, marginRight: spacing.sm },
  infoIconWrap: { marginRight: spacing.sm, alignItems: 'center' as const },
  infoText: { ...typography.bodySmall, color: colors.success, flex: 1 },

  stepsCard: {
    backgroundColor: colors.backgroundSecondary,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
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
  primaryAction: { marginBottom: 0 },
});
