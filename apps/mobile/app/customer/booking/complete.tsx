import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { Button } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';

export default function JobCompletionScreen(): React.ReactElement {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const confirmMutation = useMutation({
    mutationFn: async () => {
      await api.patch(`/api/v1/bookings/${bookingId}/status`, { status: 'confirmed' });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['booking', bookingId] });
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      void queryClient.invalidateQueries({ queryKey: ['activeBookings'] });
      router.replace({ pathname: '/customer/booking/review', params: { bookingId: bookingId! } });
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      const msg = axErr?.response?.data?.error?.message;
      Alert.alert('Error', msg ?? 'Failed to confirm. Please try again.');
    },
  });

  const handleDispute = (): void => {
    router.push({ pathname: '/customer/booking/dispute', params: { bookingId: bookingId! } });
  };

  if (!bookingId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.xxl }]}>
        <View style={styles.content}>
          <Text style={styles.title}>Missing booking information</Text>
          <Button title="Go Back" onPress={() => router.back()} variant="outline" />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.base }]}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>✅</Text>
        </View>

        <Text style={styles.title}>Job Complete!</Text>
        <Text style={styles.subtitle}>
          Your provider has marked the service as complete.{'\n'}
          Please confirm if everything looks good.
        </Text>

        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>🔒</Text>
          <Text style={styles.infoText}>
            Once confirmed, payment will be released from escrow to the provider.
            You have {platformConfig.escrowDisputeWindowHours} hours after completion to file a dispute if needed.
          </Text>
        </View>

        <View style={styles.autoConfirmCard}>
          <Text style={styles.autoConfirmIcon}>⏰</Text>
          <Text style={styles.autoConfirmText}>
            If you don't respond, the job will be auto-confirmed in {platformConfig.escrowAutoConfirmHours} hours.
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          title="Yes, looks great!"
          onPress={() => confirmMutation.mutate()}
          loading={confirmMutation.isPending}
          disabled={confirmMutation.isPending}
        />
        <Button
          title="Something's not right"
          onPress={handleDispute}
          variant="outline"
          disabled={confirmMutation.isPending}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  content: { flex: 1, alignItems: 'center' },

  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  icon: { fontSize: 40 },

  title: { ...typography.h1, color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },

  infoCard: {
    flexDirection: 'row',
    backgroundColor: colors.successLight,
    padding: spacing.base,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  infoIcon: { fontSize: 20, marginRight: spacing.sm },
  infoText: { ...typography.bodySmall, color: colors.success, flex: 1 },

  autoConfirmCard: {
    flexDirection: 'row',
    backgroundColor: colors.warningLight,
    padding: spacing.base,
    borderRadius: borderRadius.md,
  },
  autoConfirmIcon: { fontSize: 20, marginRight: spacing.sm },
  autoConfirmText: { ...typography.bodySmall, color: colors.warning, flex: 1 },

  actions: { gap: spacing.md },
});
