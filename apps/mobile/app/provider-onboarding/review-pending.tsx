import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Button, ErrorState } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ClipboardList, Lightbulb } from '@/components/icons';
import api, { refreshAuthSession, type ApiResponse } from '@/services/api';
import { getApplicationStatus } from '@/services/provider-api.service';
import { useAuthStore, type User } from '@/stores/auth.store';
import { useResponsive } from '@/hooks/useResponsive';
import { Routes } from '@/config/navigation';

const POLL_INTERVAL_MS = 15_000;

export default function ReviewPendingScreen(): React.ReactElement {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const { isPhone } = useResponsive();
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activationRefreshing, setActivationRefreshing] = useState(false);

  const applicationQuery = useQuery({
    queryKey: ['providerOnboardingStatus'],
    queryFn: getApplicationStatus,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 0,
  });

  const application = applicationQuery.data;
  const status = application?.status;

  const activateProviderWorkspace = useCallback(async (): Promise<void> => {
    setActivationError(null);
    setActivationRefreshing(true);
    try {
      const tokensRefreshed = await refreshAuthSession();
      if (!tokensRefreshed) {
        throw new Error('Could not refresh the approved session.');
      }
      const res = await api.get<ApiResponse<User>>('/api/v1/auth/me');
      const refreshedUser = res.data.data;
      if (!refreshedUser || refreshedUser.role !== 'provider') {
        throw new Error('Your approved provider access is not active yet.');
      }
      setUser(refreshedUser);
      router.replace(Routes.PROVIDER_TABS.DASHBOARD);
    } catch {
      setActivationError(
        'Your application is approved, but provider access could not be refreshed. Try again before opening the provider workspace.',
      );
    } finally {
      setActivationRefreshing(false);
    }
  }, [router, setUser]);

  useEffect(() => {
    if (status !== 'approved') return;
    void activateProviderWorkspace();
  }, [status, activateProviderWorkspace]);

  if (applicationQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loading} accessibilityRole="progressbar">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Checking application status…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (applicationQuery.isError || !application) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ErrorState
          title={applicationQuery.isError ? 'Status unavailable' : 'Application not found'}
          message={applicationQuery.isError
            ? 'We could not check your provider application. Your submission has not been changed.'
            : 'We could not find a submitted provider application for this account.'}
          onRetry={() => { void applicationQuery.refetch(); }}
        />
      </SafeAreaView>
    );
  }

  const isRejected = status === 'rejected';
  const isApproved = status === 'approved';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.content, !isPhone && styles.contentWide]}>
          <View style={styles.iconWrap}>
            <ClipboardList size={64} color={isRejected ? colors.error : isApproved ? colors.success : colors.primary} />
          </View>
          <Text style={styles.title}>
            {isRejected ? 'Application Not Approved' : isApproved ? 'Application Approved' : 'Application Under Review'}
          </Text>
          <Text style={styles.subtitle}>
            {isRejected
              ? 'Your provider application was reviewed and was not approved.'
              : isApproved
                ? 'Your application was approved. We are refreshing your account access now.'
                : 'Your documents were submitted for manual review. You can keep using the customer side while the review is pending.'}
          </Text>

          {isRejected ? (
            <View style={[styles.card, styles.rejectionCard]} accessibilityRole="alert">
              <Text style={styles.cardEyebrow}>REVIEW DECISION</Text>
              <Text style={styles.cardTitle}>Reason provided</Text>
              <Text style={styles.cardBody}>
                {application.rejectionReason?.trim() || 'No reason was included. Contact support for clarification.'}
              </Text>
            </View>
          ) : isApproved ? (
            <View style={styles.card}>
              {activationError ? (
                <>
                  <Text style={styles.cardTitle}>Access refresh needs attention</Text>
                  <Text style={styles.cardBody}>{activationError}</Text>
                  <Button
                    title={activationRefreshing ? 'Refreshing…' : 'Try Again'}
                    onPress={() => { void activateProviderWorkspace(); }}
                    loading={activationRefreshing}
                    disabled={activationRefreshing}
                  />
                </>
              ) : (
                <View style={styles.activationRow} accessibilityRole="progressbar">
                  <ActivityIndicator color={colors.primary} />
                  <Text style={styles.cardBody}>Activating provider workspace…</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.card, styles.timeline]}>
              <TimelineRow label="Application submitted" state="done" detail="Complete" />
              <View style={styles.timelineLine} />
              <TimelineRow label="Manual document review" state="active" detail="In review" />
              <View style={styles.timelineLine} />
              <TimelineRow label="Decision" state="pending" detail="Not decided" />
            </View>
          )}

          <View style={styles.infoCard}>
            <Lightbulb size={18} color={colors.info} style={styles.infoIcon} />
            <Text style={styles.infoText}>
              {isRejected
                ? 'Contact support if you need clarification about the decision or what would be required before applying again.'
                : isApproved
                  ? 'Do not close this screen until your provider workspace opens or an access message appears.'
                  : 'We will notify you when an admin records a decision. This screen checks for updates automatically.'}
            </Text>
          </View>

          {!isApproved && (
            <Button
              title="Go to Customer Home"
              onPress={() => router.replace(Routes.TABS.HOME)}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TimelineRow({
  label,
  state,
  detail,
}: {
  label: string;
  state: 'done' | 'active' | 'pending';
  detail: string;
}): React.ReactElement {
  return (
    <View style={styles.timelineItem}>
      <View style={[
        styles.timelineDot,
        state === 'done' && styles.timelineDotDone,
        state === 'active' && styles.timelineDotActive,
      ]} />
      <View style={styles.timelineContent}>
        <Text style={state === 'pending' ? styles.timelineLabelPending : styles.timelineLabel}>{label}</Text>
        <Text style={styles.timelineHint}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.xl },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { ...typography.body, color: colors.textSecondary },
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
  },
  contentWide: { paddingHorizontal: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  rejectionCard: { borderColor: colors.error },
  cardEyebrow: { ...typography.caption, color: colors.error, fontWeight: '700', marginBottom: spacing.xs },
  cardTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.sm },
  cardBody: { ...typography.body, color: colors.textSecondary, lineHeight: 22, marginBottom: spacing.md },
  activationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: { marginBottom: spacing.base, alignItems: 'center' },
  title: { ...typography.h1, color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  timeline: { marginBottom: spacing.xl },
  timelineItem: { flexDirection: 'row', alignItems: 'center' },
  timelineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.border,
    marginRight: spacing.base,
  },
  timelineDotDone: { backgroundColor: colors.success },
  timelineDotActive: { backgroundColor: colors.primary },
  timelineLine: { width: 2, height: 24, backgroundColor: colors.border, marginLeft: 7 },
  timelineContent: { flex: 1, paddingVertical: spacing.xs },
  timelineLabel: { ...typography.body, fontWeight: '600', color: colors.text },
  timelineLabelPending: { ...typography.body, color: colors.textTertiary },
  timelineHint: { ...typography.caption, color: colors.textTertiary },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: colors.infoLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.info,
    padding: spacing.base,
    marginBottom: spacing.xl,
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  infoIcon: { marginTop: 2 },
  infoText: { ...typography.bodySmall, color: colors.infoDark, flex: 1, lineHeight: 20 },
});
