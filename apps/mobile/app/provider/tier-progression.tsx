import React from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  type DimensionValue,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getTierProgression, type TierRequirement } from '@/services/provider-api.service';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import type { ComponentType } from 'react';
import { Sparkle, Check, CheckCircle2, Minus, Star, Crown } from '@/components/icons';
// A7 — shared UI kit for loading/error states.
import { SkeletonCard, ErrorState } from '@/components/ui';
import { useResponsive } from '@/hooks/useResponsive';

type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

// Founding is a parallel invite-only status, not the top of the standard
// ladder. It still receives a distinct visual treatment wherever it appears.
const TIER_COLORS: Record<string, string> = {
  founding: colors.tierFounding,
  new: colors.tierNew,
  verified: colors.tierVerified,
  pro: colors.tierPro,
  elite: colors.tierElite,
};

const TIER_ICONS: Record<string, IconComponent> = {
  founding: Crown,
  new: Sparkle,
  verified: CheckCircle2,
  pro: Star,
  elite: Crown,
};

function tierLabel(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function formatCommission(rate: number): string {
  return Number.isInteger(rate) ? String(rate) : rate.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export default function TierProgressionScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['tier-progression'],
    queryFn: getTierProgression,
  });

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={[styles.stateContent, !isPhone && styles.stateContentWide]}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={[styles.stateContent, !isPhone && styles.stateContentWide]}>
          <ErrorState
            message="We couldn't load your tier progression. Please check your connection and try again."
            onRetry={() => void refetch()}
          />
        </View>
      </View>
    );
  }

  const { currentTier, currentCommission, nextTier, requirements, allTiers } = data;
  const progressionTrack = data.progressionTrack ?? (currentTier === 'founding' ? 'founding' : 'standard');
  const progressionTiers = data.progressionTiers ?? allTiers.filter((tier) => tier.tier !== 'founding');
  const currentIdx = progressionTiers.findIndex((tier) => tier.tier === currentTier);
  const foundingTier = allTiers.find((tier) => tier.tier === 'founding');
  const currentCommissionLabel = formatCommission(currentCommission);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={[styles.headerInner, !isPhone && styles.headerInnerWide]}>
          <TouchableOpacity
            onPress={(): void => { router.back(); }}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>Provider Level</Text>
            <Text style={styles.headerSubtitle}>Commission, eligibility, and review status</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, !isPhone && styles.scrollContentWide]} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
      >
        <View
          style={[styles.workspace, !isPhone && styles.workspaceWide]}
          accessibilityLabel={isPhone ? 'Provider tier workspace' : 'Tablet and desktop provider tier workspace'}
        >
          <View style={[styles.primaryColumn, !isPhone && styles.primaryColumnWide]}>
            <View style={[styles.currentCard, { borderLeftColor: TIER_COLORS[currentTier] ?? colors.primary }]}>
              {(() => { const TierIcon = TIER_ICONS[currentTier] ?? Sparkle; return (<View style={styles.currentIconWrap}><TierIcon size={36} color={TIER_COLORS[currentTier] ?? colors.primary} /></View>); })()}
              <View style={styles.currentInfo}>
                <Text style={styles.currentLabel}>CURRENT PROVIDER LEVEL</Text>
                <Text style={[styles.currentTier, { color: TIER_COLORS[currentTier] ?? colors.text }]}>
                  {tierLabel(currentTier)}
                </Text>
                <Text style={styles.currentCommission}>{currentCommissionLabel}% live commission rate</Text>
              </View>
            </View>

            {progressionTrack === 'founding' ? (
              <View style={styles.parallelCard}>
                <Text style={styles.parallelEyebrow}>INVITE-ONLY PARALLEL STATUS</Text>
                <Text style={styles.parallelTitle}>Founding sits beside the standard ladder</Text>
                <Text style={styles.parallelText}>
                  Your Founding status is assigned by onService and is not a rung above Elite.
                  Your live commission is {currentCommissionLabel}%. The standard New to Elite path is shown for context.
                </Text>
              </View>
            ) : null}

            {nextTier && requirements && progressionTrack === 'standard' && (
              <View style={styles.progressSection}>
                <Text style={styles.sectionTitle}>
                  Eligibility for {tierLabel(nextTier.tier)}
                </Text>
                <Text style={styles.reviewNotice}>
                  Meeting every signal makes you eligible for super-admin review. Tier changes are not automatic.
                </Text>

                <View style={styles.progressBar}>
                  {progressionTiers.map((tier, idx) => {
                    const TierDotIcon = TIER_ICONS[tier.tier] ?? Sparkle;
                    return (
                    <View key={tier.tier} style={styles.progressStep}>
                      <View style={[
                        styles.progressDot,
                        idx <= currentIdx && { backgroundColor: TIER_COLORS[tier.tier] ?? colors.primary },
                        idx > currentIdx && styles.progressDotInactive,
                      ]}>
                        <TierDotIcon size={14} color={colors.white} />
                      </View>
                      <Text style={[
                        styles.progressLabel,
                        idx <= currentIdx && styles.progressLabelActive,
                      ]}>
                        {tierLabel(tier.tier)}
                      </Text>
                      {idx < progressionTiers.length - 1 && (
                        <View style={[
                          styles.progressLine,
                          idx < currentIdx && styles.progressLineActive,
                        ]} />
                      )}
                    </View>
                    );
                  })}
                </View>

                <View style={styles.reqCard}>
                  <Text style={styles.reqTitle}>Eligibility signals</Text>

                  <RequirementRow
                    label={`Complete ${requirements.jobs.required} jobs`}
                    current={`${requirements.jobs.current}/${requirements.jobs.required}`}
                    met={requirements.jobs.met}
                    progressPct={Math.min(100, (requirements.jobs.current / requirements.jobs.required) * 100)}
                  />

                  <RequirementRow
                    label={`Maintain ${requirements.rating.required.toFixed(1)}+ rating`}
                    current={requirements.rating.current?.toFixed(1) ?? 'N/A'}
                    met={requirements.rating.met}
                    progressPct={requirements.rating.current ? Math.min(100, (requirements.rating.current / 5) * 100) : 0}
                  />

                  {requirements.disputes.required && (
                    <RequirementRow
                      label="Zero open disputes"
                      current={requirements.disputes.current === 0 ? 'None' : `${requirements.disputes.current} open`}
                      met={requirements.disputes.met}
                    />
                  )}

                  {requirements.certification.required && (
                    <RequirementRow
                      label="TESDA certification (verified)"
                      current={requirements.certification.met ? 'Yes' : 'Not yet'}
                      met={requirements.certification.met}
                    />
                  )}
                </View>

                <View style={styles.benefitsCard}>
                  <Text style={styles.benefitsTitle}>What {tierLabel(nextTier.tier)} changes</Text>
                  {nextTier.benefits.map((benefit) => (
                    <View key={benefit} style={styles.benefitRow}>
                      <Check size={14} color={colors.success} style={styles.benefitCheck} />
                      <Text style={styles.benefitText}>{benefit}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {!nextTier && progressionTrack === 'standard' && (
              <View style={styles.maxTierCard}>
                <View style={styles.maxTierIconWrap}><Crown size={48} color={colors.warning} /></View>
                <Text style={styles.maxTierTitle}>Highest standard tier</Text>
                <Text style={styles.maxTierText}>
                  Elite is the final step on the standard ladder. Your current live commission rate is {currentCommissionLabel}%.
                </Text>
              </View>
            )}
          </View>
          <View style={[styles.tierColumn, !isPhone && styles.tierColumnWide]}>
            <Text style={styles.sectionTitle}>Provider level paths</Text>
            <Text style={styles.sectionIntro}>Commission values below are the current Admin-controlled rates.</Text>
            {foundingTier ? (
              <View style={styles.tierGroup}>
                <Text style={styles.tierGroupLabel}>PARALLEL INVITE-ONLY STATUS</Text>
                <TierCard tier={foundingTier} isCurrent={currentTier === 'founding'} isParallel />
              </View>
            ) : null}
            <View style={styles.tierGroup}>
              <Text style={styles.tierGroupLabel}>STANDARD LADDER</Text>
              {progressionTiers.map((tier) => (
                <TierCard key={tier.tier} tier={tier} isCurrent={tier.tier === currentTier} />
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function RequirementRow({ label, current, met, progressPct }: {
  label: string;
  current: string;
  met: boolean;
  progressPct?: number;
}): React.ReactElement {
  return (
    <View style={styles.reqRow}>
      <View style={styles.reqRowHeader}>
        <View style={styles.reqCheck}>
          {met
            ? <Check size={16} color={colors.success} />
            : <Minus size={16} color={colors.textTertiary} />}
        </View>
        <Text style={[styles.reqLabel, met && styles.reqLabelMet]}>{label}</Text>
        <Text style={styles.reqCurrent}>{current}</Text>
      </View>
      {progressPct != null && (
        <View style={styles.reqProgressTrack}>
          <View style={[styles.reqProgressFill, { width: `${progressPct}%` as DimensionValue }, met && styles.reqProgressFillMet]} />
        </View>
      )}
    </View>
  );
}

function TierCard({ tier, isCurrent, isParallel = false }: { tier: TierRequirement; isCurrent: boolean; isParallel?: boolean }): React.ReactElement {
  const TierIcon = TIER_ICONS[tier.tier] ?? Sparkle;
  return (
    <View style={[styles.tierCard, isCurrent && styles.tierCardCurrent, isCurrent && { borderColor: TIER_COLORS[tier.tier] }]}>
      <View style={styles.tierCardHeader}>
        <View style={styles.tierCardIconWrap}><TierIcon size={28} color={TIER_COLORS[tier.tier] ?? colors.text} /></View>
        <View style={styles.tierCardInfo}>
          <Text style={[styles.tierCardName, { color: TIER_COLORS[tier.tier] ?? colors.text }]}>
            {tier.tier.charAt(0).toUpperCase() + tier.tier.slice(1)}
          </Text>
          <Text style={styles.tierCardCommission}>{formatCommission(tier.commission)}% live commission</Text>
        </View>
        {isCurrent && (
          <View style={[styles.currentBadge, { backgroundColor: TIER_COLORS[tier.tier] }]}>
            <Text style={styles.currentBadgeText}>CURRENT</Text>
          </View>
        )}
      </View>
      <Text style={styles.tierCardReqs}>
        {isParallel ? 'Invite-only · Assigned by super-admin · Not part of standard progression' : (
          <>
            {tier.minJobs > 0 ? `${tier.minJobs}+ completed jobs` : 'Starting level'}
            {tier.minRating > 0 ? ` · ${tier.minRating}+ rating` : ''}
            {tier.requiresCertification ? ' · Verified TESDA certification' : ''}
            {tier.requiresZeroDisputes ? ' · Zero open disputes' : ''}
          </>
        )}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  headerInnerWide: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: spacing.xl },
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text },
  headerSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: 100 },
  scrollContentWide: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: spacing.xl },
  stateContent: { padding: spacing.base },
  stateContentWide: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: spacing.xl },
  workspace: { width: '100%' },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl },
  primaryColumn: { width: '100%' },
  primaryColumnWide: { flex: 1.08, minWidth: 0 },
  tierColumn: { width: '100%' },
  tierColumnWide: { flex: 0.92, minWidth: 360 },

  currentCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    marginBottom: spacing.lg,
  },
  currentIcon: { fontSize: 40, marginRight: spacing.base },
  currentIconWrap: { marginRight: spacing.base, alignItems: 'center' as const, justifyContent: 'center' as const },
  currentInfo: { flex: 1 },
  currentLabel: { ...typography.caption, color: colors.textTertiary, marginBottom: 2 },
  currentTier: { ...typography.h3, fontWeight: '700', marginBottom: 2 },
  currentCommission: { ...typography.bodySmall, color: colors.textSecondary },

  parallelCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  parallelEyebrow: { ...typography.caption, color: colors.tierFounding, fontWeight: '800', letterSpacing: 0.7, marginBottom: spacing.xs },
  parallelTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.sm },
  parallelText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },

  progressSection: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.base },
  sectionIntro: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginTop: -spacing.sm, marginBottom: spacing.base },
  reviewNotice: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 20,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },

  progressBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  progressStep: {
    alignItems: 'center',
    flex: 1,
    position: 'relative',
  },
  progressDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    zIndex: 1,
  },
  progressDotInactive: {
    backgroundColor: colors.border,
  },
  progressDotText: { fontSize: 18 },
  progressLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  progressLabelActive: {
    color: colors.text,
    fontWeight: '600',
  },
  progressLine: {
    position: 'absolute',
    top: 20,
    left: '60%',
    right: '-40%',
    height: 3,
    backgroundColor: colors.border,
    zIndex: 0,
  },
  progressLineActive: {
    backgroundColor: colors.success,
  },

  reqCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  reqTitle: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  reqRow: { marginBottom: spacing.md },
  reqRowHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  reqCheck: { marginRight: spacing.sm, width: 20, alignItems: 'center' },
  reqLabel: { ...typography.bodySmall, color: colors.text, flex: 1 },
  reqLabelMet: { color: colors.success },
  reqCurrent: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  reqProgressTrack: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginLeft: 28,
    overflow: 'hidden',
  },
  reqProgressFill: {
    height: 4,
    backgroundColor: colors.warning,
    borderRadius: 2,
  },
  reqProgressFillMet: {
    backgroundColor: colors.success,
  },

  benefitsCard: {
    backgroundColor: colors.successLight,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  benefitsTitle: { ...typography.body, fontWeight: '700', color: colors.success, marginBottom: spacing.sm },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.xs },
  benefitCheck: { marginRight: spacing.sm },
  benefitText: { ...typography.bodySmall, color: colors.text, flex: 1 },

  maxTierCard: {
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  maxTierIcon: { fontSize: 48, marginBottom: spacing.sm },
  maxTierIconWrap: { marginBottom: spacing.sm, alignItems: 'center' as const },
  maxTierTitle: { ...typography.h3, color: colors.text, textAlign: 'center', marginBottom: spacing.xs },
  maxTierText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },

  allTiersSection: { marginTop: spacing.base },
  tierGroup: { marginBottom: spacing.base },
  tierGroupLabel: { ...typography.caption, color: colors.textTertiary, fontWeight: '800', letterSpacing: 0.7, marginBottom: spacing.sm },
  tierCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tierCardCurrent: {
    borderWidth: 2,
  },
  tierCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  tierCardIcon: { fontSize: 24, marginRight: spacing.md },
  tierCardIconWrap: { marginRight: spacing.md, alignItems: 'center' as const, justifyContent: 'center' as const },
  tierCardInfo: { flex: 1 },
  tierCardName: { ...typography.body, fontWeight: '700' },
  tierCardCommission: { ...typography.caption, color: colors.textSecondary },
  currentBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm },
  currentBadgeText: { ...typography.caption, color: colors.white, fontWeight: '700', fontSize: 10 },
  tierCardReqs: { ...typography.caption, color: colors.textTertiary },
});
