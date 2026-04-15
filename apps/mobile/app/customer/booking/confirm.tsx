import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

export default function BookingConfirmScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();

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

        <Text style={styles.title}>Booking Confirmed!</Text>
        <Text style={styles.subtitle}>
          Your booking has been submitted successfully.{'\n'}
          We're finding the best provider for you.
        </Text>

        {bookingId && (
          <View style={styles.bookingIdCard}>
            <Text style={styles.bookingIdLabel}>Booking ID</Text>
            <Text style={styles.bookingIdValue}>#{bookingId.slice(0, 8).toUpperCase()}</Text>
          </View>
        )}

        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>🔒</Text>
          <Text style={styles.infoText}>
            Your payment is secured in escrow and will only be released when you confirm
            the job is done to your satisfaction.
          </Text>
        </View>

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
        <Button
          title="View Booking"
          onPress={() => {
            router.replace('/(tabs)/bookings');
          }}
          style={styles.primaryAction}
        />
        <Button
          title="Back to Home"
          onPress={() => router.replace('/(tabs)/home')}
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

  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  checkmark: { fontSize: 40, color: '#FFFFFF', fontWeight: '700' },

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

  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#F0FDF4',
    padding: spacing.base,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
  },
  infoIcon: { fontSize: 20, marginRight: spacing.sm },
  infoText: { ...typography.bodySmall, color: '#166534', flex: 1 },

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
