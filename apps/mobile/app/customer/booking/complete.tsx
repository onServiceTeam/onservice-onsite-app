import React from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { getBookingById } from '@/services/booking.service';
import { getErrorMessage } from '@/utils/errors';
import { Button, ErrorState, SkeletonCard } from '@/components/ui';
// A7 — toast feedback instead of modal alerts.
import { showToast } from '@/lib/toast';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';
import { CheckCircle2, Lock, Clock } from '@/components/icons';
import { useResponsive } from '@/hooks/useResponsive';
import { buildRoute, Routes } from '@/config/navigation';

export default function JobCompletionScreen(): React.ReactElement {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isPhone } = useResponsive();

  const bookingQuery = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBookingById(bookingId ?? ''),
    enabled: !!bookingId,
    staleTime: 30 * 1000,
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      await api.patch(`/api/v1/bookings/${bookingId}/status`, { status: 'confirmed' });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['booking', bookingId] });
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      void queryClient.invalidateQueries({ queryKey: ['activeBookings'] });
      router.replace({ pathname: Routes.CUSTOMER.BOOKING_REVIEW, params: { bookingId: bookingId! } });
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      showToast(getErrorMessage(err, 'Failed to confirm. Please try again.'), 'error');
    },
  });

  const handleDispute = (): void => {
    router.push({ pathname: Routes.CUSTOMER.BOOKING_DISPUTE, params: { bookingId: bookingId! } });
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

  if (bookingQuery.isLoading) {
    return (
      <View style={[styles.container, styles.stateContainer, { paddingTop: insets.top + spacing.xl }]}>
        <View style={[styles.stateContent, !isPhone && styles.stateContentWide]}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  if (bookingQuery.isError || !bookingQuery.data) {
    return (
      <View style={[styles.container, styles.stateContainer, { paddingTop: insets.top + spacing.xl }]}>
        <View style={[styles.stateContent, !isPhone && styles.stateContentWide]}>
          <ErrorState
            message="We couldn't verify this completed booking. Retry before confirming the work or releasing payment."
            onRetry={() => void bookingQuery.refetch()}
          />
        </View>
      </View>
    );
  }

  if (bookingQuery.data.status !== 'completed_by_provider') {
    const alreadyConfirmed = ['confirmed', 'payout_ready', 'paid_out'].includes(
      bookingQuery.data.status,
    );
    return (
      <View style={[styles.container, styles.stateContainer, { paddingTop: insets.top + spacing.xl }]}>
        <View style={[styles.stateContent, !isPhone && styles.stateContentWide]}>
          <ErrorState
            message={
              alreadyConfirmed
                ? 'This booking has already been confirmed. Open the booking record for its current payment and review status.'
                : 'This booking is not ready for completion confirmation. The provider must finish the job first.'
            }
            onRetry={() => void bookingQuery.refetch()}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, !isPhone && styles.scrollContentWide]}
        showsVerticalScrollIndicator={false}
      >
      <View
        style={[styles.workspace, !isPhone && styles.workspaceWide]}
        accessibilityLabel={isPhone ? 'Customer job completion' : 'Tablet and desktop customer job completion workspace'}
      >
      <View style={[styles.content, !isPhone && styles.contentWide]}>
        <View style={styles.iconCircle}>
          <CheckCircle2 size={48} color={colors.success} />
        </View>

        <Text style={styles.title}>Job Complete!</Text>
        <Text style={styles.subtitle}>
          {bookingQuery.data.providerName ?? 'Your provider'} has marked{' '}
          {bookingQuery.data.serviceName ?? bookingQuery.data.categoryName ?? 'the service'} as complete.{'\n'}
          Please confirm if everything looks good.
        </Text>

        <View style={styles.reviewCard}>
          <Text style={styles.reviewTitle}>Review the work record first</Text>
          <Text style={styles.reviewText}>
            Check the agreed scope, checklist progress, provider evidence, approved changes, and any support or dispute record before deciding.
          </Text>
          <Button
            title="Review work record"
            variant="outline"
            onPress={() => router.push(buildRoute(Routes.CUSTOMER.BOOKING_DETAIL, { id: bookingId }))}
          />
        </View>

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

      <View style={[styles.actions, !isPhone && styles.actionsWide]}>
        {!isPhone && (
          <View style={styles.actionHeading}>
            <Text style={styles.actionEyebrow}>YOUR DECISION</Text>
            <Text style={styles.actionTitle}>Confirm the completed service</Text>
            <Text style={styles.actionCopy}>Review the result before releasing payment or opening a support case.</Text>
          </View>
        )}
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  stateContainer: { paddingHorizontal: spacing.lg },
  stateContent: { width: '100%', gap: spacing.md },
  stateContentWide: { maxWidth: 760, alignSelf: 'center' },
  scrollContent: { flexGrow: 1, padding: spacing.lg, paddingTop: spacing.xxl },
  scrollContentWide: { padding: spacing.xxl, justifyContent: 'center' },
  workspace: { width: '100%', maxWidth: 560, alignSelf: 'center', flex: 1 },
  workspaceWide: { maxWidth: 1040, flexDirection: 'row', alignItems: 'center', gap: spacing.xxl },
  content: { flex: 1, alignItems: 'center' },
  contentWide: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxl,
  },

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
  reviewCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  reviewTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  reviewText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.md },

  infoCard: {
    flexDirection: 'row',
    backgroundColor: colors.primaryLight,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  infoIcon: { fontSize: 20, marginRight: spacing.sm },
  infoIconWrap: { marginRight: spacing.sm, alignItems: 'center' as const },
  infoText: { ...typography.bodySmall, color: colors.primary, flex: 1 },

  autoConfirmCard: {
    flexDirection: 'row',
    backgroundColor: colors.warningLight,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
  },
  autoConfirmIcon: { fontSize: 20, marginRight: spacing.sm },
  autoConfirmText: { ...typography.bodySmall, color: colors.warning, flex: 1 },

  actions: { gap: spacing.md, paddingTop: spacing.lg },
  actionsWide: {
    width: 340,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  actionHeading: { marginBottom: spacing.md },
  actionEyebrow: { ...typography.caption, color: colors.primary, fontWeight: '700', letterSpacing: 0.8, marginBottom: spacing.xs },
  actionTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.sm },
  actionCopy: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },
});
