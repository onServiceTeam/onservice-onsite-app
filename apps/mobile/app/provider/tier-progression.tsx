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

type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

// BUG-PHASE94-01 — founding tier added so a founding-batch provider
// viewing their tier progression sees a distinct badge color + icon
// rather than a raw fallback. Crown reused intentionally — founding
// is the highest-rate tier outside elite (10% vs elite's 9%) and the
// invite-only/parallel positioning warrants premium iconography.
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

export default function TierProgressionScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['tier-progression'],
    queryFn: getTierProgression,
  });

  if (isLoading) {
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

  if (isError || !data) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ErrorState
          message="We couldn't load your tier progression. Please check your connection and try again."
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  const { currentTier, currentCommission, nextTier, requirements, allTiers } = data;
  const currentIdx = allTiers.findIndex((t) => t.tier === currentTier);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={(): void => { router.back(); }} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Tier Progression</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
      >
        {/* Current Tier Card */}
        <View style={[styles.currentCard, { borderLeftColor: TIER_COLORS[currentTier] ?? colors.primary }]}>
          {(() => { const TierIcon = TIER_ICONS[currentTier] ?? Sparkle; return (<View style={styles.currentIconWrap}><TierIcon size={36} color={TIER_COLORS[currentTier] ?? colors.primary} /></View>); })()}
          <View style={styles.currentInfo}>
            <Text style={styles.currentLabel}>Current Tier</Text>
            <Text style={[styles.currentTier, { color: TIER_COLORS[currentTier] ?? colors.text }]}>
              {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
            </Text>
            <Text style={styles.currentCommission}>{currentCommission}% commission rate</Text>
          </View>
        </View>

        {/* Progress toward next tier */}
        {nextTier && requirements && (
          <View style={styles.progressSection}>
            <Text style={styles.sectionTitle}>
              Progress to {nextTier.tier.charAt(0).toUpperCase() + nextTier.tier.slice(1)} Tier
            </Text>

            <View style={styles.progressBar}>
              {allTiers.map((tier, idx) => {
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
                    {tier.tier.charAt(0).toUpperCase() + tier.tier.slice(1)}
                  </Text>
                  {idx < allTiers.length - 1 && (
                    <View style={[
                      styles.progressLine,
                      idx < currentIdx && styles.progressLineActive,
                    ]} />
                  )}
                </View>
                );
              })}
            </View>

            {/* Requirements Checklist */}
            <View style={styles.reqCard}>
              <Text style={styles.reqTitle}>Requirements</Text>

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

            {/* Benefits of Next Tier */}
            <View style={styles.benefitsCard}>
              <Text style={styles.benefitsTitle}>
                {nextTier.tier.charAt(0).toUpperCase() + nextTier.tier.slice(1)} Benefits
              </Text>
              {nextTier.benefits.map((benefit, idx) => (
                <View key={idx} style={styles.benefitRow}>
                  <Check size={14} color={colors.success} style={styles.benefitCheck} />
                  <Text style={styles.benefitText}>{benefit}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {!nextTier && (
          <View style={styles.maxTierCard}>
            <View style={styles.maxTierIconWrap}><Crown size={48} color={colors.warning} /></View>
            <Text style={styles.maxTierTitle}>You're at the highest tier!</Text>
            <Text style={styles.maxTierText}>
              You enjoy the lowest commission rate ({currentCommission}%) and all premium benefits.
              Keep up the excellent work!
            </Text>
          </View>
        )}

        {/* All Tiers Overview */}
        <View style={styles.allTiersSection}>
          <Text style={styles.sectionTitle}>All Tiers</Text>
          {allTiers.map((tier) => (
            <TierCard key={tier.tier} tier={tier} isCurrent={tier.tier === currentTier} />
          ))}
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

function TierCard({ tier, isCurrent }: { tier: TierRequirement; isCurrent: boolean }): React.ReactElement {
  const TierIcon = TIER_ICONS[tier.tier] ?? Sparkle;
  return (
    <View style={[styles.tierCard, isCurrent && styles.tierCardCurrent, isCurrent && { borderColor: TIER_COLORS[tier.tier] }]}>
      <View style={styles.tierCardHeader}>
        <View style={styles.tierCardIconWrap}><TierIcon size={28} color={TIER_COLORS[tier.tier] ?? colors.text} /></View>
        <View style={styles.tierCardInfo}>
          <Text style={[styles.tierCardName, { color: TIER_COLORS[tier.tier] ?? colors.text }]}>
            {tier.tier.charAt(0).toUpperCase() + tier.tier.slice(1)}
          </Text>
          <Text style={styles.tierCardCommission}>{tier.commission}% commission</Text>
        </View>
        {isCurrent && (
          <View style={[styles.currentBadge, { backgroundColor: TIER_COLORS[tier.tier] }]}>
            <Text style={styles.currentBadgeText}>CURRENT</Text>
          </View>
        )}
      </View>
      <Text style={styles.tierCardReqs}>
        {tier.minJobs > 0 ? `${tier.minJobs}+ jobs` : 'No minimum'}
        {tier.minRating > 0 ? ` · ${tier.minRating}+ rating` : ''}
        {tier.requiresCertification ? ' · TESDA certified' : ''}
        {tier.requiresZeroDisputes ? ' · No disputes' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text, flex: 1 },

  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: 100 },

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

  progressSection: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.base },

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
