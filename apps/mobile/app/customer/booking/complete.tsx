import React from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/errors';
import { Button } from '@/components/ui';
// A7 — toast feedback instead of modal alerts.
import { showToast } from '@/lib/toast';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';
import { CheckCircle2, Lock, Clock } from '@/components/icons';

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
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      showToast(getErrorMessage(err, 'Failed to confirm. Please try again.'), 'error');
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
          <CheckCircle2 size={48} color={colors.success} />
        </View>

        <Text style={styles.title}>Job Complete!</Text>
        <Text style={styles.subtitle}>
          Your provider has marked the service as complete.{'\n'}
          Please confirm if everything looks good.
        </Text>

        <View style={styles.infoCard}>
          <View style={styles.infoIconWrap}><Lock size={20} color={colors.primary} /></View>
          <Text style={styles.infoText}>
            Once confirmed, payment will be released from escrow to the provider.
            You have {platformConfig.escrowDisputeWindowHours} hours after completion to file a dispute if needed.
          </Text>
        </View>

        <View style={styles.autoConfirmCard}>
          <Clock size={18} color={colors.warning} style={styles.autoConfirmIcon} />
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
  infoIconWrap: { marginRight: spacing.sm, alignItems: 'center' as const },
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
