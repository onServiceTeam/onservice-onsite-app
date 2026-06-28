import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Switch,
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
import api from '@/services/api';
import type { Booking } from '@/services/booking.service';
// A7 — shared UI kit for loading/empty/error states + toast feedback.
import { Badge, StatusBadge, SkeletonCard, EmptyState, ErrorState } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { Bell, Calendar, Wrench, CreditCard } from '@/components/icons';
import { formatPHP } from '@/utils/currency';
// Phase 14 Remediation #5 — Bug 1234 NBI lifecycle banner.
import NbiStatusBanner from '@/components/provider/NbiStatusBanner';
import { formatRelative } from '@/utils/date';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

import { Routes } from '@/config/navigation';
// BUG-PHASE94-01 — founding tier added so the badge shows the
// proper label + color instead of falling back to raw "founding"
// + grey textTertiary.
const TIER_LABELS: Record<string, string> = {
  founding: 'Founding',
  new: 'New Provider',
  verified: 'Verified',
  pro: 'Pro',
  elite: 'Elite',
};

const TIER_COLORS: Record<string, string> = {
  founding: colors.tierFounding,
  new: colors.tierNew,
  verified: colors.tierVerified,
  pro: colors.tierPro,
  elite: colors.tierElite,
};

// BUG-PHASE64-02 fix — pre-fix the provider dashboard notification
// bell was not badged with unread count, so a provider could miss new
// review/payout/dispute alerts entirely (their only other entry point
// to /provider/notifications is via a notification deeplink, which by
// definition only fires when they DON'T need to find the screen via
// the bell). Customer side already badges the bell on home.tsx — we
// now mirror that pattern here.
async function getUnreadNotificationCount(): Promise<number> {
  const res = await api.get<{ success: boolean; meta: { unread: number } }>('/api/v1/notifications', {
    params: { page: 1, pageSize: 1 },
  });
  return res.data.meta?.unread ?? 0;
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

  // The 'dashboard-preview' discriminator is load-bearing: the Jobs tab runs
  // useInfiniteQuery(['providerJobs', filter]) and with filter='active' this
  // plain useQuery used to write a non-infinite shape into the IDENTICAL key,
  // crashing the Jobs tab (query-core reads pages.length on whatever is in
  // cache). Keeping the ['providerJobs'] prefix keeps the existing
  // invalidateQueries(['providerJobs']) calls refreshing this preview too.
  const activeJobsQuery = useQuery({
    queryKey: ['providerJobs', 'active', 'dashboard-preview'],
    queryFn: () => getProviderBookings('active', 1, 5),
    staleTime: 30 * 1000,
  });

  // BUG-PHASE64-02 fix — see comment above getUnreadNotificationCount.
  const unreadQuery = useQuery({
    queryKey: ['notifUnread'],
    queryFn: getUnreadNotificationCount,
    staleTime: 60 * 1000,
  });
  const unreadCount = unreadQuery.data ?? 0;

  const availabilityMutation = useMutation({
    mutationFn: (isAvailable: boolean) => setAvailability(isAvailable),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['providerProfile'] });
      void queryClient.invalidateQueries({ queryKey: ['availability-status'] });
      void queryClient.invalidateQueries({ queryKey: ['provider-calendar'] });
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      showToast(getErrorMessage(err, 'Failed to update availability.'), 'error');
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
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={{ padding: spacing.base }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  if (profileQuery.isError) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ErrorState
          message="We couldn't load your dashboard. Please check your connection and try again."
          onRetry={() => void profileQuery.refetch()}
        />
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
      {/* Phase 14 Remediation #5 — Bug 1234 NBI lifecycle banner */}
      <NbiStatusBanner onTap={() => router.push(Routes.PROVIDER.ACCOUNT_MANAGEMENT)} />
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
          onPress={() => router.push(Routes.PROVIDER.NOTIFICATIONS)}
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        >
          <Bell size={22} color={colors.text} />
          {unreadCount > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
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
          <TouchableOpacity onPress={() => router.push(Routes.PROVIDER_TABS.JOBS)}>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>

        {activeJobs.length === 0 ? (
          <EmptyState
            icon="📭"
            title="No active jobs right now"
            description={profile?.isAvailable
              ? 'New job requests will appear here.'
              : 'Go online to start receiving jobs.'}
          />
        ) : (
          activeJobs.map((job: Booking) => (
            <TouchableOpacity
              key={job.id}
              style={styles.jobCard}
              onPress={() => router.push(`/provider/job/${job.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.jobCardTop}>
                <StatusBadge status={job.status} size="sm" />
                <Text style={styles.jobTime}>{formatRelative(job.scheduledAt)}</Text>
              </View>
              <Text style={styles.jobService}>{job.serviceName ?? job.categoryName ?? 'Service'}</Text>
              <Text style={styles.jobAddress} numberOfLines={1}>{[job.address, job.barangay, job.city].filter(Boolean).join(', ')}</Text>
              <View style={styles.jobCardBottom}>
                {/* Phase 200 — show servicePrice (the provider's gross for
                     the job), matching the Jobs tab card. totalAmount includes
                     the customer's platform service fee, which the provider
                     never receives, so showing it here both overstated the
                     provider's take AND disagreed with the Jobs tab (the same
                     job appeared at two different prices). The job detail
                     screen shows the full net-of-commission breakdown. */}
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
            <TouchableOpacity onPress={() => router.push(Routes.PROVIDER.SERVICES)}>
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
          onPress={() => router.push(Routes.PROVIDER.CALENDAR)}
        >
          <Calendar size={24} color={colors.primary} style={styles.actionIconImg} />
          <Text style={styles.actionLabel}>Calendar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push(Routes.PROVIDER.SERVICES)}
        >
          <Wrench size={24} color={colors.primary} style={styles.actionIconImg} />
          <Text style={styles.actionLabel}>Services</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push(Routes.PROVIDER_TABS.EARNINGS)}
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
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
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
  notifButton: { padding: spacing.sm, minWidth: 44, minHeight: 44, position: 'relative' as const, justifyContent: 'center' as const, alignItems: 'center' as const },
  notifBadge: {
    position: 'absolute' as const,
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.error,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 4,
  },
  notifBadgeText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: colors.white,
  },
  notifIcon: { fontSize: 22 },

  availabilityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
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
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
  },
  emptyIcon: { fontSize: 40, marginBottom: spacing.sm },
  emptyText: { ...typography.body, color: colors.text, fontWeight: '600' },
  emptyHint: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' },

  jobCard: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  actionIcon: { fontSize: 28, marginBottom: spacing.xs },
  actionLabel: { ...typography.caption, color: colors.text, fontWeight: '600' },

  bottomSpacer: { height: 20 },
});
