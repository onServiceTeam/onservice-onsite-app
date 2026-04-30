import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, TextInput, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMemberships, getTiers, redeemPoints, type SukiMembership, type SukiTier } from '@/services/suki.service';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';
import type { ComponentType } from 'react';
import { Sparkle, Star, Award, Crown, AlertTriangle, Heart, Home as HomeIcon } from '@/components/icons';

type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

const TIER_COLORS: Record<string, { bg: string; text: string; border: string; icon: IconComponent }> = {
  new: { bg: colors.backgroundSecondary, text: colors.textSecondary, border: colors.border, icon: Sparkle },
  regular: { bg: colors.backgroundSecondary, text: colors.textSecondary, border: colors.border, icon: Star },
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
      <Text style={[styles.tierText, { color: c.text }]}>
        {TIER_DISPLAY[tier] ?? tier}
      </Text>
    </View>
  );
}

function MembershipCard({
  membership,
  tiers,
  onRedeem,
}: {
  membership: SukiMembership;
  tiers: SukiTier[];
  onRedeem: (id: string, points: number) => void;
}): React.ReactElement {
  const [redeemInput, setRedeemInput] = useState('');
  const currentTier = tiers.find(t => t.name === membership.tier);
  const nextTier = tiers.find(t => t.minBookings > membership.totalBookings);
  const bookingsToNext = nextTier ? nextTier.minBookings - membership.totalBookings : 0;

  return (
    <View style={styles.memberCard}>
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
            <Text style={[styles.statValue, { color: colors.success }]}>{currentTier.discount}%</Text>
            <Text style={styles.statLabel}>Discount</Text>
          </View>
        )}
      </View>

      {nextTier && (
        <View style={styles.progressSection}>
          <Text style={styles.progressLabel}>
            {bookingsToNext} more booking{bookingsToNext !== 1 ? 's' : ''} to {TIER_DISPLAY[nextTier.name] ?? nextTier.name}
          </Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min((membership.totalBookings / nextTier.minBookings) * 100, 100)}%` },
              ]}
            />
          </View>
        </View>
      )}

      {membership.pointsBalance > 0 && (
        <View style={styles.redeemSection}>
          <View style={styles.redeemRow}>
            <TextInput
              style={styles.redeemInput}
              keyboardType="numeric"
              value={redeemInput}
              onChangeText={setRedeemInput}
              placeholder="Points"
              placeholderTextColor={colors.textTertiary}
            />
            <TouchableOpacity
              style={[styles.redeemBtn, (!redeemInput || Number(redeemInput) < 100) && styles.redeemBtnDisabled]}
              onPress={() => {
                const pts = Number(redeemInput);
                if (pts < platformConfig.sukiMinRedeemPoints || pts % platformConfig.sukiMinRedeemPoints !== 0) {
                  Alert.alert('Invalid', `Points must be a multiple of ${platformConfig.sukiMinRedeemPoints}.`);
                } else if (pts > membership.pointsBalance) {
                  Alert.alert('Invalid', `You only have ${membership.pointsBalance} points available.`);
                } else {
                  onRedeem(membership.id, pts);
                  setRedeemInput('');
                }
              }}
              disabled={!redeemInput || Number(redeemInput) < platformConfig.sukiMinRedeemPoints}
            >
              <Text style={styles.redeemBtnText}>Redeem → Wallet</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.redeemHint}>{platformConfig.sukiPointsPerPeso} points = {formatPHP(100)} wallet credit (multiples of {platformConfig.sukiMinRedeemPoints})</Text>
        </View>
      )}

      {membership.lastBookingAt && (
        <Text style={styles.lastBooking}>
          Last booked: {new Date(membership.lastBookingAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })}
        </Text>
      )}
    </View>
  );
}

export default function SukiProsScreen(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: memberships, isLoading: membershipsLoading, isError, refetch } = useQuery({
    queryKey: ['sukiMemberships'],
    queryFn: getMemberships,
  });

  const { data: tiers, isError: tiersError } = useQuery({
    queryKey: ['sukiTiers'],
    queryFn: getTiers,
  });

  const redeemMutation = useMutation({
    mutationFn: ({ membershipId, points }: { membershipId: string; points: number }) =>
      redeemPoints(membershipId, points),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['sukiMemberships'] });
      Alert.alert('Points Redeemed', `${formatPHP(result.amountCredited)} added to your wallet.\n${result.remainingPoints} points remaining.`);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Could not redeem points.';
      Alert.alert('Error', message);
    },
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Suki Pros</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      {membershipsLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.info} />
        </View>
      ) : isError ? (
        <View style={styles.centerBox}>
          <View style={styles.emptyEmojiWrap}><AlertTriangle size={48} color={colors.error} /></View>
          <Text style={styles.emptyTitle}>Failed to load</Text>
          <Text style={styles.emptyDesc}>Something went wrong. Please try again.</Text>
          <TouchableOpacity onPress={() => void refetch()} style={[styles.redeemBtn, { marginTop: spacing.base, paddingHorizontal: 24 }]}>
            <Text style={styles.redeemBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <View style={styles.heroSection}>
            <View style={styles.heroEmojiWrap}><Heart size={48} color={colors.primary} /></View>
            <Text style={styles.heroTitle}>Suki Loyalty Program</Text>
            <Text style={styles.heroDesc}>
              Build relationships with your favorite providers. The more you book, the more you earn!
            </Text>
          </View>

          {tiersError && (
            <View style={{ backgroundColor: colors.errorLight, padding: 12, borderRadius: 10, marginBottom: 12 }}>
              <Text style={{ color: colors.error, fontSize: 13, textAlign: 'center' }}>Failed to load loyalty tiers. Pull to refresh.</Text>
            </View>
          )}

          {tiers && tiers.length > 0 && (
            <View style={styles.tiersCard}>
              <Text style={styles.tiersTitle}>Loyalty Tiers</Text>
              {tiers.map((tier) => {
                const tierColor = TIER_COLORS[tier.name] ?? TIER_COLORS.regular!;
                const RowIcon = tierColor.icon;
                return (
                  <View key={tier.name} style={styles.tierRow}>
                    <RowIcon size={20} color={tierColor.text} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tierName}>
                        {TIER_DISPLAY[tier.name] ?? tier.name}
                      </Text>
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

          {(memberships ?? []).length === 0 ? (
            <View style={styles.emptyBox}>
              <View style={styles.emptyEmojiWrap}><HomeIcon size={48} color={colors.textSecondary} /></View>
              <Text style={styles.emptyTitle}>No Suki Relationships Yet</Text>
              <Text style={styles.emptyDesc}>
                Complete bookings with the same provider to start building Suki loyalty and earn points!
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>
                Your Providers ({memberships?.length ?? 0})
              </Text>
              {memberships?.map((m) => (
                <MembershipCard
                  key={m.id}
                  membership={m}
                  tiers={tiers ?? []}
                  onRedeem={(id, pts) => redeemMutation.mutate({ membershipId: id, points: pts })}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  headerPlaceholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroSection: { alignItems: 'center', marginBottom: 20 },
  heroEmoji: { fontSize: 48, marginBottom: spacing.sm },
  heroEmojiWrap: { marginBottom: spacing.sm, alignItems: 'center' as const },
  heroTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 6 },
  heroDesc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  tiersCard: { backgroundColor: colors.white, borderRadius: 16, padding: spacing.base, borderWidth: 1, borderColor: colors.border, marginBottom: 20 },
  tiersTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  tierName: { fontSize: 14, fontWeight: '600', color: colors.text },
  tierReq: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  memberCard: { backgroundColor: colors.white, borderRadius: 16, padding: spacing.base, borderWidth: 1, borderColor: colors.border, marginBottom: 14 },
  memberHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  providerName: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 6 },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: spacing.sm, borderRadius: borderRadius.sm, borderWidth: 1 },
  tierEmoji: { fontSize: 12 },
  tierText: { fontSize: 11, fontWeight: '700' },
  pointsBox: { alignItems: 'center', backgroundColor: colors.primaryLight, borderRadius: borderRadius.md, paddingVertical: spacing.sm, paddingHorizontal: 14 },
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
  redeemInput: { width: 80, backgroundColor: colors.backgroundSecondary, borderRadius: borderRadius.md, padding: 10, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.text, textAlign: 'center' },
  redeemBtn: { flex: 1, borderRadius: borderRadius.md, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  redeemBtnDisabled: { opacity: 0.5 },
  redeemBtnText: { fontSize: 13, fontWeight: '700', color: colors.white },
  redeemHint: { fontSize: 11, color: colors.textTertiary, marginTop: 6, textAlign: 'center' },
  lastBooking: { fontSize: 11, color: colors.textTertiary, marginTop: spacing.sm },
  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
  emptyEmojiWrap: { marginBottom: spacing.md, alignItems: 'center' as const },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 6 },
  emptyDesc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
});
