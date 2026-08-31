import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getMemberships,
  getTiers,
  redeemPoints,
  type SukiMembership,
  type SukiTier,
} from '@/services/suki.service';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';
import type { ComponentType } from 'react';
import { Sparkle, Star, Award, Crown, Heart, ChevronLeft, ChevronRight } from '@/components/icons';
// A7 — shared UI kit for loading/empty/error states + toast feedback.
import { SkeletonCard, EmptyState, ErrorState, SectionHeader } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { Routes, buildRoute } from '@/config/navigation';
import { useResponsive } from '@/hooks/useResponsive';

type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

const TIER_COLORS: Record<
  string,
  { bg: string; text: string; border: string; icon: IconComponent }
> = {
  new: {
    bg: colors.backgroundSecondary,
    text: colors.textSecondary,
    border: colors.border,
    icon: Sparkle,
  },
  regular: {
    bg: colors.backgroundSecondary,
    text: colors.textSecondary,
    border: colors.border,
    icon: Star,
  },
  suki: { bg: colors.warningLight, text: colors.warning, border: colors.warning, icon: Award },
  super_suki: { bg: colors.errorLight, text: colors.error, border: colors.error, icon: Crown },
};

const TIER_DISPLAY: Record<string, string> = {
  new: 'New',
  regular: 'Regular',
  suki: 'Suki',
  super_suki: 'Super Suki',
};

function TierBadge({ tier }: { tier: string }): React.ReactElement {
  const c = TIER_COLORS[tier] ?? TIER_COLORS.new!;
  const TierIcon = c.icon;
  return (
    <View style={[styles.tierBadge, { backgroundColor: c.bg, borderColor: c.border }]}>
      <TierIcon size={14} color={c.text} />
      <Text style={[styles.tierText, { color: c.text }]}>{TIER_DISPLAY[tier] ?? tier}</Text>
    </View>
  );
}

function MembershipCard({
  membership,
  tiers,
  onRedeem,
  redeeming,
  onOpenProvider,
  isWide,
}: {
  membership: SukiMembership;
  tiers: SukiTier[];
  onRedeem: (id: string, points: number) => void;
  redeeming: boolean;
  onOpenProvider: () => void;
  isWide: boolean;
}): React.ReactElement {
  const [redeemInput, setRedeemInput] = useState('');
  const currentTier = tiers.find((t) => t.name === membership.tier);
  const nextTier = tiers.find((t) => t.minBookings > membership.totalBookings);
  const bookingsToNext = nextTier ? nextTier.minBookings - membership.totalBookings : 0;

  return (
    <View style={[styles.memberCard, isWide && styles.memberCardWide]}>
      <View style={styles.memberHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.providerName}>{membership.providerName}</Text>
          <TierBadge tier={membership.tier} />
        </View>
        <View style={styles.pointsBox}>
          <Text style={styles.pointsValue}>{membership.pointsBalance}</Text>
          <Text style={styles.pointsLabel}>pts</Text>
        </View>
      </View>

      <View style={styles.memberStats}>
        <View style={styles.memberStat}>
          <Text style={styles.statValue}>{membership.totalBookings}</Text>
          <Text style={styles.statLabel}>Bookings</Text>
        </View>
        <View style={styles.memberStat}>
          <Text style={styles.statValue}>{formatPHP(membership.totalSpent)}</Text>
          <Text style={styles.statLabel}>Total Spent</Text>
        </View>
        {currentTier && currentTier.discount > 0 && (
          <View style={styles.memberStat}>
            <Text style={[styles.statValue, { color: colors.success }]}>
              {currentTier.discount}%
            </Text>
            <Text style={styles.statLabel}>Discount</Text>
          </View>
        )}
      </View>

      {nextTier && (
        <View style={styles.progressSection}>
          <Text style={styles.progressLabel}>
            {bookingsToNext} more booking{bookingsToNext !== 1 ? 's' : ''} to{' '}
            {TIER_DISPLAY[nextTier.name] ?? nextTier.name}
          </Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min((membership.totalBookings / nextTier.minBookings) * 100, 100)}%`,
                },
              ]}
            />
          </View>
        </View>
      )}

      {membership.pointsBalance > 0 && (
        <View style={styles.redeemSection}>
          <View style={styles.redeemRow}>
            <TextInput
              accessibilityLabel="Suki points to redeem"
              style={styles.redeemInput}
              keyboardType="numeric"
              value={redeemInput}
              onChangeText={setRedeemInput}
              placeholder="Points"
              placeholderTextColor={colors.textTertiary}
            />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Redeem Suki points"
              accessibilityState={{ disabled: redeeming || !redeemInput || Number(redeemInput) < platformConfig.sukiMinRedeemPoints }}
              // BUG-PHASE73-01 fix — pre-fix the visual disabled style
              // checked `Number(redeemInput) < 100` (hardcoded) while
              // the actual disabled prop checked `<
              // platformConfig.sukiMinRedeemPoints`. If the config min
              // differs from 100 (e.g., 200), the button looked
              // enabled at 150 points but did nothing on tap. Now both
              // use the same configurable threshold.
              style={[
                styles.redeemBtn,
                (redeeming ||
                  !redeemInput ||
                  Number(redeemInput) < platformConfig.sukiMinRedeemPoints) &&
                  styles.redeemBtnDisabled,
              ]}
              onPress={() => {
                const pts = Number(redeemInput);
                if (
                  pts < platformConfig.sukiMinRedeemPoints ||
                  pts % platformConfig.sukiMinRedeemPoints !== 0
                ) {
                  showToast(
                    `Points must be a multiple of ${platformConfig.sukiMinRedeemPoints}.`,
                    'warning',
                  );
                } else if (pts > membership.pointsBalance) {
                  showToast(
                    `You only have ${membership.pointsBalance} points available.`,
                    'warning',
                  );
                } else {
                  onRedeem(membership.id, pts);
                  setRedeemInput('');
                }
              }}
              disabled={
                redeeming ||
                !redeemInput ||
                Number(redeemInput) < platformConfig.sukiMinRedeemPoints
              }
            >
              <Text style={styles.redeemBtnText}>
                {redeeming ? 'Redeeming…' : 'Redeem → Wallet'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.redeemHint}>
            {platformConfig.sukiPointsPerPeso} points = {formatPHP(100)} wallet credit (multiples of{' '}
            {platformConfig.sukiMinRedeemPoints})
          </Text>
        </View>
      )}

      {membership.lastBookingAt && (
        <Text style={styles.lastBooking}>
          Last booked:{' '}
          {new Date(membership.lastBookingAt).toLocaleDateString('en-PH', {
            timeZone: 'Asia/Manila',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </Text>
      )}

      <TouchableOpacity
        style={styles.providerLink}
        onPress={onOpenProvider}
        accessibilityRole="button"
        accessibilityLabel={`View ${membership.providerName} services; provider assignment confirmed later`}
      >
        <Text style={styles.providerLinkText}>View services</Text>
        <ChevronRight size={18} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

export default function SukiProsScreen(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isPhone } = useResponsive();

  const {
    data: memberships,
    isLoading: membershipsLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['sukiMemberships'],
    queryFn: getMemberships,
  });

  const { data: tiers, isError: tiersError, isFetching: tiersFetching, refetch: refetchTiers } = useQuery({
    queryKey: ['sukiTiers'],
    queryFn: getTiers,
  });

  const redeemMutation = useMutation({
    mutationFn: ({ membershipId, points }: { membershipId: string; points: number }) =>
      redeemPoints(membershipId, points),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['sukiMemberships'] });
      showToast(
        `${formatPHP(result.amountCredited)} added to your wallet. ${result.remainingPoints} points left.`,
        'success',
      );
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Could not redeem points.';
      showToast(message, 'error');
    },
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back from Suki Pros" onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Suki Pros</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      {membershipsLoading ? (
        <View style={styles.bodyContent}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : isError ? (
        <ErrorState
          message="We couldn't load your Suki memberships. Please check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : (
        <ScrollView
          style={styles.body}
          contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}
        >
          <View
            style={[styles.overview, !isPhone && styles.overviewWide]}
            accessibilityLabel={!isPhone ? 'Tablet and desktop customer Suki workspace' : undefined}
          >
            <View style={[styles.heroSection, !isPhone && styles.heroSectionWide]}>
              <View style={styles.heroEmojiWrap}>
                <Heart size={48} color={colors.primary} />
              </View>
              <Text style={styles.heroTitle}>Suki Loyalty Program</Text>
              <Text style={styles.heroDesc}>
                Track repeat-provider relationships, booking history, tiers, and points in one
                place.
              </Text>
              <Text style={styles.assignmentNotice}>
                Opening a provider lets you choose a service. Provider assignment is confirmed later
                in the booking process.
              </Text>
            </View>

            {tiersError && (
              <View
                style={{
                  backgroundColor: colors.errorLight,
                  padding: 12,
                  borderRadius: 10,
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: colors.error, fontSize: 13, textAlign: 'center' }}>
                  Loyalty tier rules could not be loaded. Points and tier benefits may be incomplete.
                </Text>
                <TouchableOpacity
                  style={styles.tierRetry}
                  onPress={() => void refetchTiers()}
                  disabled={tiersFetching}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loyalty tiers"
                  accessibilityState={{ disabled: tiersFetching, busy: tiersFetching }}
                >
                  <Text style={styles.tierRetryText}>{tiersFetching ? 'Retrying…' : 'Try again'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {tiers && tiers.length > 0 && (
              <View style={[styles.tiersCard, !isPhone && styles.tiersCardWide]}>
                <Text style={styles.tiersTitle}>Loyalty Tiers</Text>
                {tiers.map((tier) => {
                  const tierColor = TIER_COLORS[tier.name] ?? TIER_COLORS.regular!;
                  const RowIcon = tierColor.icon;
                  return (
                    <View key={tier.name} style={styles.tierRow}>
                      <RowIcon size={20} color={tierColor.text} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.tierName}>{TIER_DISPLAY[tier.name] ?? tier.name}</Text>
                        <Text style={styles.tierReq}>
                          {tier.minBookings}+ bookings • {tier.pointsMultiplier}x points
                          {tier.discount > 0 ? ` • ${tier.discount}% off` : ''}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {(memberships ?? []).length === 0 ? (
            // BUG-PHASE174-01 — empty state has a "Browse Services" CTA (the
            // Suki feature requires repeat bookings with the same provider).
            <EmptyState
              icon={<Heart size={48} color={colors.textTertiary} />}
              title="No Suki Relationships Yet"
              description="Complete bookings with the same provider to start building Suki loyalty and earn points!"
              actionLabel="Browse Services"
              onAction={() => router.push(Routes.TABS.HOME)}
            />
          ) : (
            <View>
              <SectionHeader title={`Your Providers (${memberships?.length ?? 0})`} />
              <View
                style={[styles.membershipGrid, !isPhone && styles.membershipGridWide]}
                accessibilityLabel={!isPhone ? 'Suki provider card grid' : undefined}
              >
                {memberships?.map((m) => (
                  <MembershipCard
                    key={m.id}
                    membership={m}
                    tiers={tiers ?? []}
                    onRedeem={(id, pts) => redeemMutation.mutate({ membershipId: id, points: pts })}
                    redeeming={redeemMutation.isPending}
                    isWide={!isPhone}
                    onOpenProvider={() =>
                      router.push(
                        buildRoute(Routes.CUSTOMER.PROVIDER_PROFILE, { id: m.providerId }),
                      )
                    }
                  />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  headerPlaceholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  bodyContentWide: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: spacing.lg },
  overview: { width: '100%' },
  overviewWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroSection: { alignItems: 'center', marginBottom: 20 },
  heroSectionWide: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    marginBottom: 0,
  },
  heroEmoji: { fontSize: 48, marginBottom: spacing.sm },
  heroEmojiWrap: { marginBottom: spacing.sm, alignItems: 'center' as const },
  heroTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 6 },
  heroDesc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  assignmentNotice: {
    fontSize: 12,
    color: colors.textTertiary,
    lineHeight: 18,
    marginTop: spacing.md,
    maxWidth: 520,
  },
  tiersCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: 20,
  },
  tiersCardWide: { flex: 1, marginBottom: 0 },
  tiersTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  tierRetry: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  tierRetryText: { fontSize: 13, fontWeight: '700', color: colors.error },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  tierName: { fontSize: 14, fontWeight: '600', color: colors.text },
  tierReq: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  memberCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: 14,
  },
  memberCardWide: { width: '48.8%' },
  membershipGrid: { width: '100%' },
  membershipGridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  memberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  providerName: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 6 },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  tierEmoji: { fontSize: 12 },
  tierText: { fontSize: 11, fontWeight: '700' },
  pointsBox: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: 14,
  },
  pointsValue: { fontSize: 20, fontWeight: '800', color: colors.primaryDark },
  pointsLabel: { fontSize: 10, color: colors.primary, textTransform: 'uppercase' },
  memberStats: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  memberStat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  progressSection: { marginBottom: spacing.md },
  progressLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 6 },
  progressBar: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.info, borderRadius: 3 },
  redeemSection: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  redeemRow: { flexDirection: 'row', gap: spacing.sm },
  redeemInput: {
    width: 80,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
  },
  redeemBtn: {
    flex: 1,
    borderRadius: borderRadius.md,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  redeemBtnDisabled: { opacity: 0.5 },
  redeemBtnText: { fontSize: 13, fontWeight: '700', color: colors.white },
  redeemHint: { fontSize: 11, color: colors.textTertiary, marginTop: 6, textAlign: 'center' },
  lastBooking: { fontSize: 11, color: colors.textTertiary, marginTop: spacing.sm },
  providerLink: {
    minHeight: 44,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  providerLinkText: { fontSize: 14, color: colors.primary, fontWeight: '700' },
  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
  emptyEmojiWrap: { marginBottom: spacing.md, alignItems: 'center' as const },
  // BUG-PHASE174-01 fix styles for the Browse Services CTA.
  emptyCta: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    minHeight: 44,
    justifyContent: 'center' as const,
  },
  emptyCtaText: { color: colors.white, fontWeight: '600', fontSize: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 6 },
  emptyDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
});
