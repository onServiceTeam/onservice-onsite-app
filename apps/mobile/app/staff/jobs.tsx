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
import { MapPin, Clock, LogOut } from '@/components/icons';
// A7 — shared UI kit for loading/empty/error states.
import { SkeletonCard, EmptyState, ErrorState } from '@/components/ui';

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

  const { data: jobs, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['staffJobs'],
    queryFn: getMyAssignedJobs,
    staleTime: 30 * 1000,
  });

  function handleLogout(): void {
    logout();
    router.replace('/');
  }

  const list = jobs ?? [];

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
        contentContainerStyle={styles.bodyContent}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} tintColor={colors.primary} colors={[colors.primary]} />}
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
            icon="📋"
            title="No jobs assigned yet"
            description="When your provider assigns you a job, it shows up here."
          />
        )}

        {list.map((job: StaffAssignedJob) => (
          <TouchableOpacity
            key={job.id}
            style={styles.jobCard}
            activeOpacity={0.8}
            onPress={() => router.push(`/staff/job/${job.id}`)}
          >
            <View style={styles.jobTop}>
              <Text style={styles.jobService}>{job.serviceName ?? 'Service'}</Text>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>{job.status.replace(/_/g, ' ')}</Text>
              </View>
            </View>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { ...typography.h2, color: colors.text },
  headerSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  logoutBtn: { padding: spacing.xs },

  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  errorBox: { backgroundColor: colors.errorLight, padding: 12, borderRadius: 10, marginBottom: 12 },
  errorText: { color: colors.error, fontSize: 13, textAlign: 'center' },

  empty: { alignItems: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  emptyTitle: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  emptyText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },

  jobCard: {
    backgroundColor: colors.backgroundSecondary, borderRadius: borderRadius.md,
    padding: spacing.base, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  jobTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  jobService: { ...typography.body, fontWeight: '700', color: colors.text, flex: 1 },
  statusPill: { backgroundColor: colors.primaryLight, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm },
  statusPillText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  jobCustomer: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  jobMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  jobMeta: { ...typography.caption, color: colors.textTertiary, flex: 1 },
});
