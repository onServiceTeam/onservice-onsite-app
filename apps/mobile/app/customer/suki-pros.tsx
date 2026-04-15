import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, TextInput, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMemberships, getTiers, redeemPoints, type SukiMembership, type SukiTier } from '@/services/suki.service';

function formatCurrency(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

const TIER_COLORS: Record<string, { bg: string; text: string; border: string; emoji: string }> = {
  new: { bg: '#F8FAFC', text: '#64748B', border: '#E2E8F0', emoji: '🌱' },
  regular: { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1', emoji: '⭐' },
  suki: { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A', emoji: '🌟' },
  super_suki: { bg: '#FDF2F8', text: '#831843', border: '#F9A8D4', emoji: '💎' },
};

const TIER_DISPLAY: Record<string, string> = {
  new: 'New',
  regular: 'Regular',
  suki: 'Suki',
  super_suki: 'Super Suki',
};

function TierBadge({ tier }: { tier: string }) {
  const c = TIER_COLORS[tier] ?? TIER_COLORS.new!;
  return (
    <View style={[styles.tierBadge, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={styles.tierEmoji}>{c.emoji}</Text>
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
}) {
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
          <Text style={styles.statValue}>{formatCurrency(membership.totalSpent)}</Text>
          <Text style={styles.statLabel}>Total Spent</Text>
        </View>
        {currentTier && currentTier.discount > 0 && (
          <View style={styles.memberStat}>
            <Text style={[styles.statValue, { color: '#10B981' }]}>{currentTier.discount}%</Text>
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
              placeholderTextColor="#94A3B8"
            />
            <TouchableOpacity
              style={[styles.redeemBtn, (!redeemInput || Number(redeemInput) < 100) && styles.redeemBtnDisabled]}
              onPress={() => {
                const pts = Number(redeemInput);
                if (pts < 100 || pts % 100 !== 0) {
                  Alert.alert('Invalid', 'Points must be a multiple of 100.');
                } else if (pts > membership.pointsBalance) {
                  Alert.alert('Invalid', `You only have ${membership.pointsBalance} points available.`);
                } else {
                  onRedeem(membership.id, pts);
                  setRedeemInput('');
                }
              }}
              disabled={!redeemInput || Number(redeemInput) < 100}
            >
              <Text style={styles.redeemBtnText}>Redeem → Wallet</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.redeemHint}>100 points = ₱1.00 wallet credit (multiples of 100)</Text>
        </View>
      )}

      {membership.lastBookingAt && (
        <Text style={styles.lastBooking}>
          Last booked: {new Date(membership.lastBookingAt).toLocaleDateString()}
        </Text>
      )}
    </View>
  );
}

export default function SukiProsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: memberships, isLoading: membershipsLoading } = useQuery({
    queryKey: ['sukiMemberships'],
    queryFn: getMemberships,
  });

  const { data: tiers } = useQuery({
    queryKey: ['sukiTiers'],
    queryFn: getTiers,
  });

  const redeemMutation = useMutation({
    mutationFn: ({ membershipId, points }: { membershipId: string; points: number }) =>
      redeemPoints(membershipId, points),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['sukiMemberships'] });
      Alert.alert('Points Redeemed', `₱${(result.amountCredited / 100).toFixed(2)} added to your wallet.\n${result.remainingPoints} points remaining.`);
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
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
          <ActivityIndicator size="large" color="#00B4D8" />
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <View style={styles.heroSection}>
            <Text style={styles.heroEmoji}>🤝</Text>
            <Text style={styles.heroTitle}>Suki Loyalty Program</Text>
            <Text style={styles.heroDesc}>
              Build relationships with your favorite providers. The more you book, the more you earn!
            </Text>
          </View>

          {tiers && tiers.length > 0 && (
            <View style={styles.tiersCard}>
              <Text style={styles.tiersTitle}>Loyalty Tiers</Text>
              {tiers.map((tier) => {
                const colors = TIER_COLORS[tier.name] ?? TIER_COLORS.regular!;
                return (
                  <View key={tier.name} style={styles.tierRow}>
                    <Text style={{ fontSize: 20 }}>{colors.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tierName}>
                        {TIER_DISPLAY[tier.name] ?? tier.name}
                      </Text>
                      <Text style={styles.tierReq}>
                        {tier.minBookings}+ bookings • {tier.pointsPerBooking} pts/booking
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
              <Text style={styles.emptyEmoji}>🏠</Text>
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
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  backBtn: { padding: 4 },
  backText: { fontSize: 22, color: '#1B3A4B' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1B3A4B' },
  headerPlaceholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 40 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroSection: { alignItems: 'center', marginBottom: 20 },
  heroEmoji: { fontSize: 48, marginBottom: 8 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#1B3A4B', marginBottom: 6 },
  heroDesc: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20 },
  tiersCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 20 },
  tiersTitle: { fontSize: 15, fontWeight: '700', color: '#1B3A4B', marginBottom: 12 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  tierName: { fontSize: 14, fontWeight: '600', color: '#1B3A4B' },
  tierReq: { fontSize: 12, color: '#64748B', marginTop: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1B3A4B', marginBottom: 12 },
  memberCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 14 },
  memberHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  providerName: { fontSize: 16, fontWeight: '700', color: '#1B3A4B', marginBottom: 6 },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1 },
  tierEmoji: { fontSize: 12 },
  tierText: { fontSize: 11, fontWeight: '700' },
  pointsBox: { alignItems: 'center', backgroundColor: '#F0F9FF', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  pointsValue: { fontSize: 20, fontWeight: '800', color: '#0C4A6E' },
  pointsLabel: { fontSize: 10, color: '#0369A1', textTransform: 'uppercase' },
  memberStats: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  memberStat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '700', color: '#1B3A4B' },
  statLabel: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  progressSection: { marginBottom: 12 },
  progressLabel: { fontSize: 12, color: '#64748B', marginBottom: 6 },
  progressBar: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#00B4D8', borderRadius: 3 },
  redeemSection: { borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 12 },
  redeemRow: { flexDirection: 'row', gap: 8 },
  redeemInput: { width: 80, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 14, color: '#1B3A4B', textAlign: 'center' },
  redeemBtn: { flex: 1, borderRadius: 10, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  redeemBtnDisabled: { opacity: 0.5 },
  redeemBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  redeemHint: { fontSize: 11, color: '#94A3B8', marginTop: 6, textAlign: 'center' },
  lastBooking: { fontSize: 11, color: '#94A3B8', marginTop: 8 },
  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1B3A4B', marginBottom: 6 },
  emptyDesc: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20, maxWidth: 280 },
});
