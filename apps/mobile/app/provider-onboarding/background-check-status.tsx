import React, { useState, useCallback } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
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
import { formatDateTime } from '@/utils/date';
import { Routes } from '@/config/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from '@/components/icons';

type CheckStatus = 'pending' | 'approved' | 'rejected';

interface BackgroundCheckState {
  status: CheckStatus;
  estimatedCompletionAt?: string;
  reason?: string;
}

interface BackgroundCheckHookResult {
  data: BackgroundCheckState;
  loading: boolean;
  refetch: () => Promise<void>;
}

function useBackgroundCheckStatus(): BackgroundCheckHookResult {
  const defaultEta = new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString();
  const [data, setData] = useState<BackgroundCheckState>({
    status: 'pending',
    estimatedCompletionAt: defaultEta,
  });
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      // Placeholder: real implementation would call the backend.
      await new Promise<void>((resolve) => setTimeout(resolve, 600));
      setData((prev) => ({ ...prev }));
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, refetch };
}

const NEXT_STEPS: { title: string; body: string }[] = [
  {
    title: 'NBI clearance review',
    body: 'Our verification team is matching your details with NBI records.',
  },
  {
    title: 'Identity cross-check',
    body: 'Your selfie is compared with the government ID you submitted.',
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
  const { data, loading, refetch } = useBackgroundCheckStatus();
  const [delayedExpanded, setDelayedExpanded] = useState(false);

  const badge = statusBadgeStyle(data.status);
  const etaLabel = data.estimatedCompletionAt
    ? formatDateTime(data.estimatedCompletionAt)
    : 'Within 48 hours';

  const goToDashboard = (): void => {
    router.push(Routes.PROVIDER_TABS.DASHBOARD);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.7}>
          <ArrowLeft size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Background Check</Text>
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
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.statusCard, { backgroundColor: badge.bg }]}>
          <View style={styles.statusIconWrap}>
            <StatusIcon status={data.status} />
          </View>
          <Text style={[styles.statusBadge, { color: badge.text }]}>{badge.label}</Text>
          <Text style={styles.statusHeadline}>
            {data.status === 'pending' && 'Your background check is in progress.'}
            {data.status === 'approved' && 'You are verified and ready to go!'}
            {data.status === 'rejected' && 'We could not approve your application.'}
          </Text>
          {data.status === 'pending' && (
            <Text style={styles.statusEta}>Estimated completion: {etaLabel}</Text>
          )}
        </View>

        {data.status === 'rejected' && data.reason && (
          <View style={styles.reasonCard}>
            <Text style={styles.reasonTitle}>Reason</Text>
            <Text style={styles.reasonText}>{data.reason}</Text>
          </View>
        )}

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
          <Text style={styles.expandableTitle}>What to do if delayed</Text>
          {delayedExpanded ? (
            <ChevronUp size={18} color={colors.textSecondary} />
          ) : (
            <ChevronDown size={18} color={colors.textSecondary} />
          )}
        </TouchableOpacity>

        {delayedExpanded && (
          <View style={styles.expandableBody}>
            <Text style={styles.expandableLine}>
              • Most checks complete within 48 hours. Allow up to 5 business days during peak periods.
            </Text>
            <Text style={styles.expandableLine}>
              • Make sure your phone notifications and email are enabled — we will reach out if we
              need more information.
            </Text>
            <Text style={styles.expandableLine}>
              • If you have not heard back after 5 business days, contact support so we can review
              your case.
            </Text>
          </View>
        )}

        {data.status === 'approved' && (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={goToDashboard}
            activeOpacity={0.7}
          >
            <Text style={styles.primaryBtnText}>Go to Dashboard</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
  stepRow: { flexDirection: 'row', marginBottom: spacing.md },
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
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
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
