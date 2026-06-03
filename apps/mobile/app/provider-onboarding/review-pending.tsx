import React, { useEffect } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ClipboardList, Lightbulb } from '@/components/icons';
import api, { type ApiResponse } from '@/services/api';
import { getMyProfile } from '@/services/provider-api.service';
import { useAuthStore, type User } from '@/stores/auth.store';

import { Routes } from '@/config/navigation';

// BUG-PHASE95-01 fix — pre-fix this screen showed a static timeline
// and a "Go to Home" button. The terms.tsx submit comment claimed
// "REVIEW_PENDING screen polls /provider/me for status and the
// customer/provider tab routing follows the canonical role from the
// auth store" — but the screen never actually polled. Providers had
// to manually re-login (or fully restart the app) for the role flip
// to take effect after admin approval.
//
// Now: polls /api/v1/providers/me every 15s. When the application
// flips to status='approved', re-fetches /api/v1/auth/me to pick up
// the new users.role from the backend, updates the auth store, and
// auto-navigates to the provider dashboard. status='rejected' shows
// an inline rejection notice instead of the timeline.
const POLL_INTERVAL_MS = 15_000;

export default function ReviewPendingScreen(): React.ReactElement {
  const router = useRouter();
  const { setUser } = useAuthStore();

  const providerStatusQuery = useQuery({
    queryKey: ['providerOnboardingStatus'],
    queryFn: async () => {
      try {
        const profile = await getMyProfile();
        return profile.status;
      } catch {
        // 404 (no provider row yet) is expected during the first poll
        // before the application row is committed. Treat as still
        // pending so the timeline keeps rendering.
        return 'pending' as const;
      }
    },
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 0,
  });

  const status = providerStatusQuery.data ?? 'pending';

  useEffect(() => {
    if (status !== 'approved') return;
    let cancelled = false;
    (async () => {
      try {
        // Refresh the user profile so the auth-store role reflects
        // the backend's post-approval users.role = 'provider'.
        const res = await api.get<ApiResponse<User>>('/api/v1/auth/me');
        if (cancelled) return;
        const refreshedUser = res.data.data;
        if (refreshedUser) setUser(refreshedUser);
      } catch {
        // Best-effort refresh; the role will catch up on the next
        // sign-in if this fails for any reason.
      } finally {
        if (!cancelled) {
          router.replace(Routes.PROVIDER_TABS.DASHBOARD);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [status, setUser, router]);

  const isRejected = status === 'rejected';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.iconWrap}><ClipboardList size={64} color={isRejected ? colors.error : colors.primary} /></View>
        <Text style={styles.title}>{isRejected ? 'Application Not Approved' : 'Application Under Review'}</Text>
        <Text style={styles.subtitle}>
          {isRejected
            ? 'Your application could not be approved at this time. Please contact support to discuss next steps.'
            : 'Thank you for applying to become an onService provider! Our team will review your documents and verify your identity.'}
        </Text>

        {!isRejected && (
          <View style={styles.timeline}>
            <View style={styles.timelineItem}>
              <View style={[styles.timelineDot, styles.timelineDotDone]} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineLabel}>Application Submitted</Text>
                <Text style={styles.timelineHint}>Just now</Text>
              </View>
            </View>
            <View style={styles.timelineLine} />
            <View style={styles.timelineItem}>
              <View style={[styles.timelineDot, styles.timelineDotActive]} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineLabel}>Identity Verification</Text>
                <Text style={styles.timelineHint}>In progress</Text>
              </View>
            </View>
            <View style={styles.timelineLine} />
            <View style={styles.timelineItem}>
              <View style={styles.timelineDot} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineLabelPending}>NBI Clearance Check</Text>
                <Text style={styles.timelineHint}>Pending</Text>
              </View>
            </View>
            <View style={styles.timelineLine} />
            <View style={styles.timelineItem}>
              <View style={styles.timelineDot} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineLabelPending}>Profile Activated</Text>
                <Text style={styles.timelineHint}>24-48 hours</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.infoCard}>
          <Lightbulb size={18} color={colors.info} style={styles.infoIcon} />
          <Text style={styles.infoText}>
            {isRejected
              ? "If you believe this was a mistake, our support team can review the decision and let you know what's needed to re-apply."
              : "We'll notify you via SMS and push notification once your application is approved. This screen also auto-refreshes every 15 seconds — when you're approved we'll take you to your provider dashboard."}
          </Text>
        </View>

        <Button
          title="Go to Home"
          onPress={() => router.replace(Routes.TABS.HOME)}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
  },
  icon: { fontSize: 64, textAlign: 'center', marginBottom: spacing.base },
  iconWrap: { marginBottom: spacing.base, alignItems: 'center' as const },
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
  timelineLine: {
    width: 2,
    height: 24,
    backgroundColor: colors.border,
    marginLeft: 7,
  },
  timelineContent: { flex: 1, paddingVertical: spacing.xs },
  timelineLabel: { ...typography.body, fontWeight: '600', color: colors.text },
  timelineLabelPending: { ...typography.body, color: colors.textTertiary },
  timelineHint: { ...typography.caption, color: colors.textTertiary },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: colors.infoLight,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.xl,
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  infoIcon: { marginTop: 2 },
  infoText: { ...typography.bodySmall, color: colors.infoDark, flex: 1, lineHeight: 20 },
});
