import React, { useEffect, useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { AlertCircle } from '@/components/icons';

import { Routes } from '@/config/navigation';
// Phase D CRIT-89 fix — pre-fix the screen claimed bookings were
// held for 15 minutes, but the server's unmatched-booking expiry
// is platformConfig.unmatchedBookingExpiryHours (default 72 hours,
// admin-tunable). The mismatch made customers panic when their
// "15 min" timer hit 0 even though the booking was still recoverable.
// Server is the source of truth; expose 72h here for now and TODO:
// fetch from /api/v1/config when that endpoint widens to include it.
const HOLD_SECONDS = 72 * 60 * 60; // 72 hours — matches server.

function formatCountdown(totalSeconds: number): string {
  // Phase D CRIT-89 fix — formatter now shows H:MM:SS for long
  // durations (was M:SS only, which displayed "4320:00" for 72h).
  const safe = Math.max(0, totalSeconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) {
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function PaymentFailedScreen(): React.ReactElement {
  const router = useRouter();
  const { reason, bookingId } = useLocalSearchParams<{ reason?: string; bookingId?: string }>();
  const [secondsLeft, setSecondsLeft] = useState(HOLD_SECONDS);

  useEffect(() => {
    if (!bookingId) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [bookingId]);

  const failureMessage = reason && reason.trim().length > 0
    ? reason
    : "We couldn't process your payment.";

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconWrap}>
          <View style={styles.iconCircle}>
            <AlertCircle size={56} color={colors.error} />
          </View>
        </View>

        <Text style={styles.title}>Payment Failed</Text>
        <Text style={styles.subtitle}>
          Don&apos;t worry — your booking is still saved. You can try again with the same or a
          different payment method.
        </Text>

        <View style={styles.reasonCard}>
          <Text style={styles.reasonLabel}>Reason</Text>
          <Text style={styles.reasonText}>{failureMessage}</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Text style={styles.primaryBtnText}>Retry Payment</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.push(Routes.CUSTOMER.PAYMENT_METHODS)}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryBtnText}>Use Different Payment Method</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => router.push(Routes.CUSTOMER.HELP)}
            activeOpacity={0.7}
          >
            <Text style={styles.linkBtnText}>Contact Support</Text>
          </TouchableOpacity>
        </View>

        {bookingId && (
          <Text style={styles.holdText}>
            {/* Phase D CRIT-89 fix — was "15 minutes". Server actually
                 holds the unmatched booking for 72h
                 (unmatchedBookingExpiryHours). */}
            Your booking is held for up to 72 hours. Time left:{' '}
            <Text style={styles.holdCountdown}>{formatCountdown(secondsLeft)}</Text>
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    alignItems: 'stretch',
  },
  iconWrap: { alignItems: 'center', marginBottom: spacing.lg },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    lineHeight: 22,
  },
  reasonCard: {
    backgroundColor: colors.errorLight,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
  },
  reasonLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.error,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  reasonText: { ...typography.body, color: colors.error, lineHeight: 22 },
  actions: { gap: spacing.sm, marginBottom: spacing.lg },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.base,
    alignItems: 'center',
  },
  primaryBtnText: { ...typography.button, color: colors.white },
  secondaryBtn: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.base,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  secondaryBtnText: { ...typography.button, color: colors.text },
  linkBtn: { paddingVertical: spacing.sm, alignItems: 'center' },
  linkBtnText: { ...typography.button, color: colors.primary },
  holdText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  holdCountdown: { fontWeight: '700', color: colors.text },
});
