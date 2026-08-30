import React, { useState, useCallback, useEffect } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
// Phase K CRIT-K07 fix — useBackgroundCheckStatus now hits the real
// /api/v1/providers/application-status endpoint (backend service:
// providerService.getApplicationStatus). Pre-fix this hook returned
// hardcoded 'pending' state with a +48h ETA — the screen was a UI
// shell with no data wiring. Real implementation:
//   - GET /api/v1/providers/application-status
//   - Maps backend statuses (pending/approved/rejected/suspended) to
//     the screen's CheckStatus enum.
//   - Surfaces rejection_reason when status='rejected'.
//   - Refresh polls the same endpoint.
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Routes } from '@/config/navigation';
import api, { type ApiResponse } from '@/services/api';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from '@/components/icons';
import { useResponsive } from '@/hooks/useResponsive';

type CheckStatus = 'pending' | 'approved' | 'rejected';

interface BackgroundCheckState {
  status: CheckStatus;
  reason?: string;
}

interface BackgroundCheckHookResult {
  data: BackgroundCheckState | null;
  loading: boolean;
  error: boolean;
  refetch: () => Promise<void>;
}

interface ApplicationStatusResponse {
  status: string;
  rejectionReason: string | null;
}

function mapServerStatus(serverStatus: string): CheckStatus {
  if (serverStatus === 'approved') return 'approved';
  if (serverStatus === 'rejected' || serverStatus === 'suspended') return 'rejected';
  // pending, under_review, and any unknown string default to 'pending'.
  return 'pending';
}

function useBackgroundCheckStatus(): BackgroundCheckHookResult {
  const [data, setData] = useState<BackgroundCheckState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refetch = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get<ApiResponse<ApplicationStatusResponse | null>>(
        '/api/v1/providers/application-status',
      );
      const body = res.data.data;
      if (!body) {
        setData(null);
        return;
      }
      const mapped: BackgroundCheckState = {
        status: mapServerStatus(body.status),
        ...(body.rejectionReason ? { reason: body.rejectionReason } : {}),
      };
      setData(mapped);
    } catch {
      // Keep the last confirmed state while making refresh failure visible.
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch on mount + every 60s while screen is open so the
  // user sees fresh status without manually refreshing.
  useEffect(() => {
    void refetch();
    const interval = setInterval(() => { void refetch(); }, 60_000);
    return () => clearInterval(interval);
  }, [refetch]);

  return { data, loading, error, refetch };
}

const NEXT_STEPS: { title: string; body: string }[] = [
  {
    title: 'Application review',
    body: 'An authorized reviewer checks the identity, clearance, and provider details you submitted.',
  },
  {
    title: 'Decision recorded',
    body: 'The app shows the recorded decision and any rejection reason supplied by the reviewer.',
  },
  {
    title: 'Account activation',
    body: 'Once approved, you can accept jobs and start earning.',
  },
];

function statusBadgeStyle(status: CheckStatus): {
  bg: string;
  text: string;
  label: string;
} {
  if (status === 'approved') {
    return { bg: colors.successLight, text: colors.successDark, label: 'Approved' };
  }
  if (status === 'rejected') {
    return { bg: colors.errorLight, text: colors.error, label: 'Rejected' };
  }
  return { bg: colors.warningLight, text: colors.warningDark, label: 'Pending' };
}

function StatusIcon({ status }: { status: CheckStatus }): React.ReactElement {
  if (status === 'approved') return <CheckCircle2 size={28} color={colors.successDark} />;
  if (status === 'rejected') return <AlertCircle size={28} color={colors.error} />;
  return <Clock size={28} color={colors.warningDark} />;
}

export default function BackgroundCheckStatusScreen(): React.ReactElement {
  const router = useRouter();
  const { data, loading, error, refetch } = useBackgroundCheckStatus();
  const [delayedExpanded, setDelayedExpanded] = useState(false);
  const { isPhone } = useResponsive();

  const activateProviderAccess = (): void => {
    router.replace(Routes.PROVIDER_ONBOARDING.REVIEW_PENDING);
  };

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingState} accessibilityRole="progressbar">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingStateText}>Checking application status…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.emptyState} accessibilityRole={error ? 'alert' : 'summary'}>
          <AlertCircle size={36} color={error ? colors.error : colors.textTertiary} />
          <Text style={styles.emptyStateTitle}>{error ? 'Status unavailable' : 'No provider application found'}</Text>
          <Text style={styles.emptyStateBody}>
            {error
              ? 'We could not check your application status. No pending decision is being inferred.'
              : 'This account has not submitted a provider application. Start the reviewed application when you are ready.'}
          </Text>
          {error ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => { void refetch(); }} accessibilityRole="button">
              <Text style={styles.primaryBtnText}>Try Again</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.replace(Routes.PROVIDER_ONBOARDING.ROLE_SELECT)}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>Start Provider Application</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.replace(Routes.TABS.HOME)}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryBtnText}>Go to Customer Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const badge = statusBadgeStyle(data.status);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.7}>
          <ArrowLeft size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Application Review</Text>
        <TouchableOpacity
          onPress={refetch}
          style={styles.iconBtn}
          activeOpacity={0.7}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <RefreshCw size={18} color={colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[styles.workspace, !isPhone && styles.workspaceWide]}
          accessibilityLabel={isPhone ? 'Application review status' : 'Tablet and desktop application review status workspace'}
        >
        <View style={styles.statusColumn}>
        <View style={[styles.statusCard, { backgroundColor: badge.bg }]}>
          <View style={styles.statusIconWrap}>
            <StatusIcon status={data.status} />
          </View>
          <Text style={[styles.statusBadge, { color: badge.text }]}>{badge.label}</Text>
          <Text style={styles.statusHeadline}>
            {data.status === 'pending' && 'Your provider application is under review.'}
            {data.status === 'approved' && 'Your application was approved.'}
            {data.status === 'rejected' && 'We could not approve your application.'}
          </Text>
          {data.status === 'pending' && <Text style={styles.statusEta}>The app checks the recorded status automatically.</Text>}
        </View>

        {error && (
          <TouchableOpacity style={styles.refreshError} onPress={() => { void refetch(); }} accessibilityRole="button">
            <Text style={styles.refreshErrorTitle}>Latest status unavailable</Text>
            <Text style={styles.refreshErrorText}>The last confirmed status remains shown. Tap to try again.</Text>
          </TouchableOpacity>
        )}

        {data.status === 'rejected' && data.reason && (
          <View style={styles.reasonCard}>
            <Text style={styles.reasonTitle}>Reason</Text>
            <Text style={styles.reasonText}>{data.reason}</Text>
          </View>
        )}
        </View>

        <View style={styles.stepsColumn}>
        <Text style={styles.sectionTitle}>What happens next</Text>
        {NEXT_STEPS.map((step, idx) => (
          <View key={step.title} style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{idx + 1}</Text>
            </View>
            <View style={styles.stepInfo}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepBody}>{step.body}</Text>
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={styles.expandable}
          onPress={() => setDelayedExpanded((prev) => !prev)}
          activeOpacity={0.7}
        >
          <Text style={styles.expandableTitle}>Need help with the review?</Text>
          {delayedExpanded ? (
            <ChevronUp size={18} color={colors.textSecondary} />
          ) : (
            <ChevronDown size={18} color={colors.textSecondary} />
          )}
        </TouchableOpacity>

        {delayedExpanded && (
          <View style={styles.expandableBody}>
            <Text style={styles.expandableLine}>
              • Use refresh to check the latest decision recorded for your account.
            </Text>
            <Text style={styles.expandableLine}>
              • Make sure your phone notifications and email are enabled — we will reach out if we
              need more information.
            </Text>
            <Text style={styles.expandableLine}>
              • Contact support if the status does not change or you need help understanding a decision.
            </Text>
          </View>
        )}

        {data.status === 'approved' && (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={activateProviderAccess}
            activeOpacity={0.7}
          >
            <Text style={styles.primaryBtnText}>Activate Provider Access</Text>
          </TouchableOpacity>
        )}
        </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingStateText: { ...typography.body, color: colors.textSecondary },
  emptyState: {
    flex: 1,
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyStateTitle: { ...typography.h2, color: colors.text, textAlign: 'center', marginTop: spacing.md },
  emptyStateBody: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginTop: spacing.sm },
  secondaryBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  secondaryBtnText: { ...typography.button, color: colors.primary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.h3, color: colors.text },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: spacing.xl },
  bodyContentWide: { width: '100%', maxWidth: 1040, alignSelf: 'center', padding: spacing.xl },
  workspace: { width: '100%', gap: spacing.lg },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start' },
  statusColumn: { flex: 1, minWidth: 0 },
  stepsColumn: { flex: 1, minWidth: 0 },
  statusCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  statusIconWrap: { marginBottom: spacing.sm },
  statusBadge: {
    ...typography.caption,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  statusHeadline: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  statusEta: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  refreshError: {
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.warning,
    padding: spacing.base,
    marginBottom: spacing.lg,
  },
  refreshErrorTitle: { ...typography.bodySmall, color: colors.text, fontWeight: '700' },
  refreshErrorText: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 18 },
  reasonCard: {
    backgroundColor: colors.errorLight,
    borderRadius: borderRadius.md,
    padding: spacing.base,
    marginBottom: spacing.lg,
  },
  reasonTitle: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.error,
    marginBottom: spacing.xs,
  },
  reasonText: { ...typography.bodySmall, color: colors.error, lineHeight: 20 },
  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },
  stepRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  stepNumberText: { ...typography.bodySmall, fontWeight: '700', color: colors.primary },
  stepInfo: { flex: 1 },
  stepTitle: { ...typography.body, fontWeight: '600', color: colors.text, marginBottom: 2 },
  stepBody: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },
  expandable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  expandableTitle: { ...typography.body, fontWeight: '600', color: colors.text },
  expandableBody: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
  },
  expandableLine: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.base,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  primaryBtnText: { ...typography.button, color: colors.white },
});
