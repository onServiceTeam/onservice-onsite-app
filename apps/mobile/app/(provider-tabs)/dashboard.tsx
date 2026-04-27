import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import {
  getMyProfile,
  setAvailability,
  getProviderBookings,
} from '@/services/provider-api.service';
import type { Booking } from '@/services/booking.service';
import { Badge } from '@/components/ui';
import { AlertTriangle, Bell, Calendar, Wrench, CreditCard, Inbox } from '@/components/icons';
import { formatPHP } from '@/utils/currency';
import { formatRelative } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

const TIER_LABELS: Record<string, string> = {
  new: 'New Provider',
  verified: 'Verified',
  pro: 'Pro',
  elite: 'Elite',
};

const TIER_COLORS: Record<string, string> = {
  new: colors.tierNew,
  verified: colors.tierVerified,
  pro: colors.tierPro,
  elite: colors.tierElite,
};

function getJobStatusColor(status: string): string {
  const map: Record<string, string> = {
    matched: colors.statusConfirmed,
    paid: colors.statusConfirmed,
    provider_en_route: colors.statusInProgress,
    provider_arrived: colors.statusInProgress,
    in_progress: colors.statusInProgress,
    completed_by_provider: colors.statusCompleted,
  };
  return map[status] ?? colors.textTertiary;
}

export default function ProviderDashboardScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ['providerProfile'],
    queryFn: getMyProfile,
    staleTime: 60 * 1000,
  });

  const activeJobsQuery = useQuery({
    queryKey: ['providerJobs', 'active'],
    queryFn: () => getProviderBookings('active', 1, 5),
    staleTime: 30 * 1000,
  });

  const availabilityMutation = useMutation({
    mutationFn: (isAvailable: boolean) => setAvailability(isAvailable),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['providerProfile'] });
      void queryClient.invalidateQueries({ queryKey: ['availability-status'] });
      void queryClient.invalidateQueries({ queryKey: ['provider-calendar'] });
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      Alert.alert('Error', axErr?.response?.data?.error?.message ?? 'Failed to update availability.');
    },
  });

  const isRefreshing = profileQuery.isRefetching || activeJobsQuery.isRefetching;
  const onRefresh = useCallback(() => {
    void profileQuery.refetch();
    void activeJobsQuery.refetch();
  }, [profileQuery, activeJobsQuery]);

  const profile = profileQuery.data;
  const activeJobs = activeJobsQuery.data?.bookings ?? [];

  if (profileQuery.isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.secondary} />
      </View>
    );
  }

  if (profileQuery.isError) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <AlertTriangle size={48} color={colors.error} style={styles.errorIcon} />
        <Text style={styles.errorText}>Failed to load your profile.</Text>
        <TouchableOpacity onPress={() => void profileQuery.refetch()}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + spacing.sm }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.secondary} />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>
            Hello, {user?.firstName ?? 'Provider'}
          </Text>
          {profile && (
            <Badge
              label={TIER_LABELS[profile.tier] ?? profile.tier}
              backgroundColor={TIER_COLORS[profile.tier] ?? colors.textTertiary}
              size="sm"
            />
          )}
        </View>
        <TouchableOpacity
          style={styles.notifButton}
          onPress={() => router.push('/provider/notifications')}
        >
          <Bell size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {profile && (
        <View style={styles.availabilityCard}>
          <View style={styles.availabilityInfo}>
            <Text style={styles.availabilityLabel}>
              {profile.isAvailable ? 'You\'re Online' : 'You\'re Offline'}
            </Text>
            <Text style={styles.availabilityHint}>
              {profile.isAvailable
                ? 'Accepting new job requests'
                : 'Toggle on to receive jobs'}
            </Text>
          </View>
          <Switch
            value={profile.isAvailable}
            onValueChange={(val) => availabilityMutation.mutate(val)}
            trackColor={{ false: colors.border, true: colors.secondary }}
            thumbColor={colors.white}
            disabled={availabilityMutation.isPending}
          />
        </View>
      )}

      {profile && (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {profile.rating != null ? profile.rating.toFixed(1) : '—'}
            </Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{profile.totalJobs}</Text>
            <Text style={styles.statLabel}>Total Jobs</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {profile.acceptanceRate != null
                ? `${Math.round(profile.acceptanceRate * 100)}%`
                : '—'}
            </Text>
            <Text style={styles.statLabel}>Accept Rate</Text>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active Jobs</Text>
          <TouchableOpacity onPress={() => router.push('/(provider-tabs)/jobs')}>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>

        {activeJobs.length === 0 ? (
          <View style={styles.emptyJobs}>
            <Inbox size={40} color={colors.textTertiary} style={styles.emptyIconImg} />
            <Text style={styles.emptyText}>No active jobs right now</Text>
            <Text style={styles.emptyHint}>
              {profile?.isAvailable
                ? 'New job requests will appear here'
                : 'Go online to start receiving jobs'}
            </Text>
          </View>
        ) : (
          activeJobs.map((job: Booking) => (
            <TouchableOpacity
              key={job.id}
              style={styles.jobCard}
              onPress={() => router.push(`/provider/job/${job.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.jobCardTop}>
                <Badge
                  label={job.status.replace(/_/g, ' ').toUpperCase()}
                  backgroundColor={getJobStatusColor(job.status)}
                  size="sm"
                />
                <Text style={styles.jobTime}>{formatRelative(job.scheduledAt)}</Text>
              </View>
              <Text style={styles.jobService}>{job.serviceName ?? job.categoryName ?? 'Service'}</Text>
              <Text style={styles.jobAddress} numberOfLines={1}>{[job.address, job.barangay, job.city].filter(Boolean).join(', ')}</Text>
              <View style={styles.jobCardBottom}>
                <Text style={styles.jobPrice}>{formatPHP(job.servicePrice)}</Text>
                <Text style={styles.jobArrow}>›</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      {profile && profile.services.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Services</Text>
            <TouchableOpacity onPress={() => router.push('/provider/services')}>
              <Text style={styles.seeAllText}>Manage</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.servicesChips}>
            {profile.services.slice(0, 4).map((svc) => (
              <View key={svc.id} style={styles.serviceChip}>
                <Text style={styles.serviceChipText}>{svc.subcategoryName}</Text>
              </View>
            ))}
            {profile.services.length > 4 && (
              <View style={styles.serviceChip}>
                <Text style={styles.serviceChipText}>+{profile.services.length - 4} more</Text>
              </View>
            )}
          </View>
        </View>
      )}

      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/provider/calendar')}
        >
          <Calendar size={24} color={colors.primary} style={styles.actionIconImg} />
          <Text style={styles.actionLabel}>Calendar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/provider/services')}
        >
          <Wrench size={24} color={colors.primary} style={styles.actionIconImg} />
          <Text style={styles.actionLabel}>Services</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/(provider-tabs)/earnings')}
        >
          <CreditCard size={24} color={colors.primary} style={styles.actionIconImg} />
          <Text style={styles.actionLabel}>Earnings</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  errorEmoji: { fontSize: 48, marginBottom: spacing.base },
  errorIcon: { marginBottom: spacing.base },
  emptyIconImg: { marginBottom: spacing.sm },
  actionIconImg: { marginBottom: spacing.xs },
  errorText: { ...typography.body, color: colors.error, marginBottom: spacing.md },
  retryText: { ...typography.body, color: colors.secondary, fontWeight: '600' },
  scrollContent: { paddingHorizontal: spacing.base, paddingBottom: 20 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.base,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  greeting: { ...typography.h2, color: colors.text },
  notifButton: { padding: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const, alignItems: 'center' as const },
  notifIcon: { fontSize: 22 },

  availabilityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
  },
  availabilityInfo: { flex: 1 },
  availabilityLabel: { ...typography.h3, color: colors.text },
  availabilityHint: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.base,
    alignItems: 'center',
  },
  statValue: { ...typography.h2, color: colors.text },
  statLabel: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },

  section: { marginBottom: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.h3, color: colors.text },
  seeAllText: { ...typography.bodySmall, color: colors.secondary, fontWeight: '600' },

  emptyJobs: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
  },
  emptyIcon: { fontSize: 40, marginBottom: spacing.sm },
  emptyText: { ...typography.body, color: colors.text, fontWeight: '600' },
  emptyHint: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' },

  jobCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  jobCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  jobTime: { ...typography.caption, color: colors.textTertiary },
  jobService: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  jobAddress: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.sm },
  jobCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  jobPrice: { ...typography.priceSmall, color: colors.secondary },
  jobArrow: { fontSize: 22, color: colors.textTertiary },

  servicesChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  serviceChip: {
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  serviceChipText: { ...typography.bodySmall, color: colors.text, fontWeight: '500' },

  quickActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  actionIcon: { fontSize: 28, marginBottom: spacing.xs },
  actionLabel: { ...typography.caption, color: colors.text, fontWeight: '600' },

  bottomSpacer: { height: 20 },
});
