import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { getMyAssignedJobs, type StaffAssignedJob } from '@/services/provider-staff.service';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ClipboardList, MapPin, Clock, LogOut } from '@/components/icons';
// A7 — shared UI kit for loading/empty/error states.
import { SkeletonCard, EmptyState, ErrorState } from '@/components/ui';
import { Routes } from '@/config/navigation';
import { useResponsive } from '@/hooks/useResponsive';

const ACTIVE_STATUSES = new Set(['provider_en_route', 'provider_arrived', 'in_progress']);

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    paid: 'Ready to start',
    provider_en_route: 'On the way',
    provider_arrived: 'Arrived',
    in_progress: 'In progress',
    completed_by_provider: 'Customer review',
    confirmed: 'Completed',
    cancelled_by_customer: 'Cancelled',
    cancelled_by_provider: 'Cancelled',
  };
  return labels[status] ?? status.replace(/_/g, ' ');
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'Not scheduled';
  try {
    return new Date(iso).toLocaleString('en-PH', {
      timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function StaffJobsScreen(): React.ReactElement {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const { isPhone } = useResponsive();

  const { data: jobs, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['staffJobs'],
    queryFn: getMyAssignedJobs,
    staleTime: 30 * 1000,
  });

  function handleLogout(): void {
    void logout().finally(() => router.replace(Routes.ROOT));
  }

  const list = jobs ?? [];
  const activeCount = list.filter((job) => ACTIVE_STATUSES.has(job.status)).length;
  const readyCount = list.filter((job) => job.status === 'paid').length;
  const reviewCount = list.filter((job) => job.status === 'completed_by_provider').length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>My Jobs</Text>
          <Text style={styles.headerSub}>
            {user?.firstName ? `Hi ${user.firstName}` : 'Team member'} · assigned to you
          </Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <LogOut size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <View
          style={[styles.overviewCard, !isPhone && styles.overviewCardWide]}
          accessibilityLabel={isPhone ? 'Assigned field work overview' : 'Tablet and desktop assigned field work overview'}
        >
          <View style={styles.overviewCopy}>
            <Text style={styles.eyebrow}>FIELD WORKSPACE</Text>
            <Text style={styles.overviewTitle}>Assigned field work</Text>
            <Text style={styles.overviewText}>
              This workspace contains only jobs assigned to your approved team-member account. Open a job to record arrival, tasks, evidence, and completion.
            </Text>
          </View>
          <View style={styles.metricRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{activeCount}</Text>
              <Text style={styles.metricLabel}>Active now</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{readyCount}</Text>
              <Text style={styles.metricLabel}>Ready</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{reviewCount}</Text>
              <Text style={styles.metricLabel}>Customer review</Text>
            </View>
          </View>
        </View>

        <View style={styles.listHeading}>
          <View>
            <Text style={styles.listTitle}>Your assignments</Text>
            <Text style={styles.listHint}>Highest-priority work appears first.</Text>
          </View>
          {!isLoading && !isError ? <Text style={styles.listCount}>{list.length} total</Text> : null}
        </View>

        <View
          style={[styles.jobGrid, !isPhone && styles.jobGridWide]}
          accessibilityLabel={isPhone ? 'Assigned jobs' : 'Tablet and desktop assigned jobs grid'}
        >
        {isLoading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}
        {isError && (
          <ErrorState
            compact
            message="We couldn't load your jobs. Please check your connection and try again."
            onRetry={() => { void refetch(); }}
          />
        )}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon={<ClipboardList size={48} color={colors.textTertiary} />}
            title="No jobs assigned yet"
            description="When your provider assigns you a job, it shows up here."
          />
        )}

        {list.map((job: StaffAssignedJob) => (
          <TouchableOpacity
            key={job.id}
            style={[styles.jobCard, !isPhone && styles.jobCardWide]}
            activeOpacity={0.8}
            onPress={() => router.push(`/staff/job/${job.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${job.serviceName ?? 'service'} job${job.customerName ? ` for ${job.customerName}` : ''}`}
          >
            <View style={styles.jobTop}>
              <Text style={styles.jobService}>{job.serviceName ?? 'Service'}</Text>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>{statusLabel(job.status)}</Text>
              </View>
            </View>
            {job.providerBusinessName ? <Text style={styles.jobProvider}>{job.providerBusinessName}</Text> : null}
            {job.customerName ? <Text style={styles.jobCustomer}>{job.customerName}</Text> : null}
            <View style={styles.jobMetaRow}>
              <Clock size={13} color={colors.textTertiary} />
              <Text style={styles.jobMeta}>{formatWhen(job.scheduledAt)}</Text>
            </View>
            {(job.address || job.city) ? (
              <View style={styles.jobMetaRow}>
                <MapPin size={13} color={colors.textTertiary} />
                <Text style={styles.jobMeta} numberOfLines={1}>
                  {[job.address, job.barangay, job.city].filter(Boolean).join(', ')}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  headerTitle: { ...typography.h2, color: colors.text },
  headerSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  logoutBtn: { padding: spacing.xs },

  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  bodyContentWide: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: spacing.xl },
  overviewCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.lg,
  },
  overviewCardWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  overviewCopy: { flex: 1, minWidth: 0, maxWidth: 620 },
  eyebrow: { ...typography.caption, color: colors.primary, fontWeight: '800', letterSpacing: 0.8, marginBottom: spacing.xs },
  overviewTitle: { ...typography.h1, color: colors.text, marginBottom: spacing.xs },
  overviewText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metricCard: {
    minWidth: 112,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  metricValue: { ...typography.h2, color: colors.text },
  metricLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  listHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: spacing.md },
  listTitle: { ...typography.h2, color: colors.text },
  listHint: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  listCount: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  jobGrid: { width: '100%' },
  jobGridWide: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  errorBox: { backgroundColor: colors.errorLight, padding: 12, borderRadius: 10, marginBottom: 12 },
  errorText: { color: colors.error, fontSize: 13, textAlign: 'center' },

  empty: { alignItems: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  emptyTitle: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  emptyText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },

  jobCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.base, marginBottom: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  jobCardWide: { flexBasis: '48%', flexGrow: 1, minWidth: 340, marginBottom: 0 },
  jobTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  jobService: { ...typography.body, fontWeight: '700', color: colors.text, flex: 1 },
  statusPill: { backgroundColor: colors.primaryLight, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm },
  statusPillText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  jobProvider: { ...typography.caption, color: colors.primary, fontWeight: '700', marginTop: spacing.xs },
  jobCustomer: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  jobMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  jobMeta: { ...typography.caption, color: colors.textTertiary, flex: 1 },
});
