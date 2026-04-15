import { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyCode, getMyReferrals, redeemCode } from '@/services/referral.service';

function formatCurrency(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

export default function ReferralScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [redeemInput, setRedeemInput] = useState('');

  const { data: code, isLoading: codeLoading } = useQuery({
    queryKey: ['myReferralCode'],
    queryFn: getMyCode,
  });

  const { data: referrals, isLoading: referralsLoading } = useQuery({
    queryKey: ['myReferrals'],
    queryFn: getMyReferrals,
  });

  const redeemMutation = useMutation({
    mutationFn: () => redeemCode(redeemInput.trim().toUpperCase()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['myReferrals'] });
      setRedeemInput('');
      Alert.alert('Success', 'Referral code redeemed! A bonus has been added to your wallet.');
    },
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const handleShare = async () => {
    if (!code?.code) return;
    try {
      await Share.share({
        message: `Join onService using my referral code: ${code.code}\n\nGet ₱50 bonus on your first booking! Download the app now.`,
      });
    } catch {
      // User cancelled share
    }
  };

  const handleCopy = () => {
    if (!code?.code) return;
    Alert.alert('Your Code', code.code, [{ text: 'OK' }]);
  };

  const isLoading = codeLoading || referralsLoading;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Referral Program</Text>
        <View style={styles.placeholder} />
      </View>

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#00B4D8" />
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <View style={styles.heroCard}>
            <Text style={styles.heroEmoji}>🎁</Text>
            <Text style={styles.heroTitle}>Earn ₱50 for Every Friend!</Text>
            <Text style={styles.heroDesc}>
              Share your code, your friend gets ₱50 on signup, and you earn ₱50 after their first completed booking.
            </Text>
          </View>

          {code && (
            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>Your Referral Code</Text>
              <Text style={styles.codeText}>{code.code}</Text>
              <View style={styles.codeActions}>
                <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
                  <Text style={styles.copyBtnText}>📋 Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
                  <Text style={styles.shareBtnText}>📤 Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{referrals?.code?.usesCount ?? 0}</Text>
              <Text style={styles.statLabel}>Friends Referred</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {formatCurrency(
                  (referrals?.redemptions ?? [])
                    .filter(r => r.referrerCredited)
                    .reduce((sum, r) => sum + r.referrerBonus, 0)
                )}
              </Text>
              <Text style={styles.statLabel}>Total Earned</Text>
            </View>
          </View>

          <View style={styles.redeemSection}>
            <Text style={styles.sectionTitle}>Have a Referral Code?</Text>
            <View style={styles.redeemRow}>
              <TextInput
                style={styles.redeemInput}
                value={redeemInput}
                onChangeText={setRedeemInput}
                placeholder="Enter code"
                placeholderTextColor="#94A3B8"
                autoCapitalize="characters"
                maxLength={10}
              />
              <TouchableOpacity
                style={[styles.redeemBtn, !redeemInput.trim() && styles.redeemBtnDisabled]}
                onPress={() => redeemMutation.mutate()}
                disabled={!redeemInput.trim() || redeemMutation.isPending}
              >
                {redeemMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.redeemBtnText}>Redeem</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {(referrals?.redemptions ?? []).length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Referral History</Text>
              {referrals?.redemptions.map((r) => (
                <View key={r.id} style={styles.historyItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyLabel}>
                      {r.referrerCredited ? 'Bonus earned' : 'Pending first booking'}
                    </Text>
                    <Text style={styles.historyDate}>
                      {new Date(r.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={[styles.historyAmount, r.referrerCredited && styles.historyAmountGreen]}>
                    {r.referrerCredited ? `+${formatCurrency(r.referrerBonus)}` : 'Pending'}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.howItWorks}>
            <Text style={styles.sectionTitle}>How It Works</Text>
            <View style={styles.step}>
              <Text style={styles.stepNum}>1</Text>
              <Text style={styles.stepText}>Share your unique referral code with friends</Text>
            </View>
            <View style={styles.step}>
              <Text style={styles.stepNum}>2</Text>
              <Text style={styles.stepText}>They sign up and get ₱50 wallet bonus instantly</Text>
            </View>
            <View style={styles.step}>
              <Text style={styles.stepNum}>3</Text>
              <Text style={styles.stepText}>After their first completed booking, you earn ₱50 too!</Text>
            </View>
          </View>
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
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 40 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroCard: { backgroundColor: '#0C4A6E', borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 20 },
  heroEmoji: { fontSize: 48, marginBottom: 12 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#FFF', marginBottom: 8, textAlign: 'center' },
  heroDesc: { fontSize: 14, color: '#BAE6FD', textAlign: 'center', lineHeight: 20 },
  codeCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 2, borderColor: '#00B4D8', borderStyle: 'dashed', marginBottom: 16 },
  codeLabel: { fontSize: 12, color: '#64748B', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  codeText: { fontSize: 32, fontWeight: '900', color: '#1B3A4B', letterSpacing: 4, marginBottom: 16 },
  codeActions: { flexDirection: 'row', gap: 12 },
  copyBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#F1F5F9' },
  copyBtnText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  shareBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#00B4D8' },
  shareBtnText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  statValue: { fontSize: 22, fontWeight: '800', color: '#1B3A4B' },
  statLabel: { fontSize: 12, color: '#64748B', marginTop: 4 },
  redeemSection: { marginBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1B3A4B', marginBottom: 10 },
  redeemRow: { flexDirection: 'row', gap: 10 },
  redeemInput: { flex: 1, backgroundColor: '#FFF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', fontSize: 16, fontWeight: '600', color: '#1B3A4B', letterSpacing: 2, textAlign: 'center' },
  redeemBtn: { paddingHorizontal: 24, borderRadius: 12, backgroundColor: '#1B3A4B', alignItems: 'center', justifyContent: 'center' },
  redeemBtnDisabled: { opacity: 0.5 },
  redeemBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  section: { marginBottom: 24 },
  historyItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 8 },
  historyLabel: { fontSize: 14, fontWeight: '600', color: '#1B3A4B' },
  historyDate: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  historyAmount: { fontSize: 14, fontWeight: '700', color: '#F59E0B' },
  historyAmountGreen: { color: '#10B981' },
  howItWorks: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#00B4D8', color: '#FFF', fontSize: 14, fontWeight: '700', textAlign: 'center', lineHeight: 28, overflow: 'hidden' },
  stepText: { flex: 1, fontSize: 14, color: '#475569', lineHeight: 20 },
});
