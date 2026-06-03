import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { getMyCode, getMyReferrals, redeemCode } from '@/services/referral.service';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';
import { AlertTriangle, ClipboardList, Gift, Send, ChevronLeft } from '@/components/icons';

export default function ReferralScreen(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [redeemInput, setRedeemInput] = useState('');

  const { data: code, isLoading: codeLoading, isError: codeError, refetch: refetchCode } = useQuery({
    queryKey: ['myReferralCode'],
    queryFn: getMyCode,
  });

  const { data: referrals, isLoading: referralsLoading, isError: referralsError, refetch: refetchReferrals } = useQuery({
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
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Could not redeem referral code.';
      Alert.alert('Error', message);
    },
  });

  const refereeAmount = code ? formatPHP(code.refereeBonus) : formatPHP(platformConfig.referralBonusDefault);
  const referrerAmount = code ? formatPHP(code.referrerBonus) : formatPHP(platformConfig.referralBonusDefault);

  const handleShare = async (): Promise<void> => {
    if (!code?.code) return;
    try {
      await Share.share({
        message: `Join ${platformConfig.appName} using my referral code: ${code.code}\n\nGet ${refereeAmount} bonus on your first booking! Download the app now.`,
      });
    } catch {
      // User cancelled share
    }
  };

  // BUG-PHASE58-03 fix — pre-fix the Copy button called
  // Share.share({ message: code.code }) which opens the system
  // share sheet, NOT the clipboard. The button was labeled "Copy"
  // and there was a separate "Share" button right next to it that
  // did the same thing. Now: actual clipboard write via expo-
  // clipboard, with toast confirmation matching the user's
  // expectation that "Copy" copies.
  const handleCopy = async (): Promise<void> => {
    if (!code?.code) return;
    try {
      await Clipboard.setStringAsync(code.code);
      Alert.alert('Copied', `Code "${code.code}" copied to clipboard.`);
    } catch {
      Alert.alert('Copy Failed', 'Could not copy to clipboard.');
    }
  };

  const isLoading = codeLoading || referralsLoading;
  const isError = codeError || referralsError;
  const refetchAll = (): void => { void refetchCode(); void refetchReferrals(); };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Referral Program</Text>
        <View style={styles.placeholder} />
      </View>

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.info} />
        </View>
      ) : isError ? (
        <View style={styles.centerBox}>
          <View style={{ marginBottom: spacing.md, alignItems: 'center' as const }}><AlertTriangle size={48} color={colors.error} /></View>
          <Text style={styles.heroTitle}>Failed to load</Text>
          <TouchableOpacity onPress={refetchAll} style={[styles.redeemBtn, { marginTop: spacing.base, paddingVertical: 12 }]}>
            <Text style={styles.redeemBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <View style={styles.heroCard}>
            <Gift size={48} color={colors.primary} style={{ marginBottom: spacing.md }} />
            <Text style={styles.heroTitle}>Earn {referrerAmount} for Every Friend!</Text>
            <Text style={styles.heroDesc}>
              Share your code, your friend gets {refereeAmount} on signup, and you earn {referrerAmount} after their first completed booking.
            </Text>
          </View>

          {code && (
            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>Your Referral Code</Text>
              <Text style={styles.codeText}>{code.code}</Text>
              <View style={styles.codeActions}>
                <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
                  <View style={styles.copyBtnRow}>
                    <ClipboardList size={14} color={colors.primary} />
                    <Text style={styles.copyBtnText}> Copy</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
                  <Send size={16} color={colors.white} />
                  <Text style={styles.shareBtnText}> Share</Text>
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
                {formatPHP(
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
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="characters"
                maxLength={10}
              />
              <TouchableOpacity
                style={[styles.redeemBtn, !redeemInput.trim() && styles.redeemBtnDisabled]}
                onPress={() => redeemMutation.mutate()}
                disabled={!redeemInput.trim() || redeemMutation.isPending}
              >
                {redeemMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.white} />
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
                      {new Date(r.createdAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  </View>
                  <Text style={[styles.historyAmount, r.referrerCredited && styles.historyAmountGreen]}>
                    {r.referrerCredited ? `+${formatPHP(r.referrerBonus)}` : 'Pending'}
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
              <Text style={styles.stepText}>They sign up and get {refereeAmount} wallet bonus instantly</Text>
            </View>
            <View style={styles.step}>
              <Text style={styles.stepNum}>3</Text>
              <Text style={styles.stepText}>After their first completed booking, you earn {referrerAmount} too!</Text>
            </View>
          </View>
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
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroCard: { backgroundColor: colors.primaryDark, borderRadius: 16, padding: spacing.lg, alignItems: 'center', marginBottom: 20 },
  heroEmoji: { fontSize: 48, marginBottom: spacing.md },
  heroTitle: { fontSize: 20, fontWeight: '800', color: colors.white, marginBottom: spacing.sm, textAlign: 'center' },
  heroDesc: { fontSize: 14, color: colors.primaryLight, textAlign: 'center', lineHeight: 20 },
  codeCard: { backgroundColor: colors.white, borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 2, borderColor: colors.info, borderStyle: 'dashed', marginBottom: spacing.base },
  codeLabel: { fontSize: 12, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm },
  codeText: { fontSize: 32, fontWeight: '900', color: colors.text, letterSpacing: 4, marginBottom: spacing.base },
  codeActions: { flexDirection: 'row', gap: spacing.md },
  copyBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: borderRadius.md, backgroundColor: colors.backgroundSecondary },
  copyBtnRow: { flexDirection: 'row' as const, alignItems: 'center' as const },
  copyBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 20, borderRadius: borderRadius.md, backgroundColor: colors.info },
  shareBtnText: { fontSize: 14, fontWeight: '600', color: colors.white },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: colors.white, borderRadius: borderRadius.lg, padding: spacing.base, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },
  redeemSection: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 10 },
  redeemRow: { flexDirection: 'row', gap: 10 },
  redeemInput: { flex: 1, backgroundColor: colors.white, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, fontSize: 16, fontWeight: '600', color: colors.text, letterSpacing: 2, textAlign: 'center' },
  redeemBtn: { paddingHorizontal: spacing.lg, borderRadius: 12, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  redeemBtnDisabled: { opacity: 0.5 },
  redeemBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },
  section: { marginBottom: spacing.lg },
  historyItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  historyLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  historyDate: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  historyAmount: { fontSize: 14, fontWeight: '700', color: colors.warning },
  historyAmountGreen: { color: colors.success },
  howItWorks: { backgroundColor: colors.white, borderRadius: 16, padding: spacing.base, borderWidth: 1, borderColor: colors.border },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.info, color: colors.white, fontSize: 14, fontWeight: '700', textAlign: 'center', lineHeight: 28, overflow: 'hidden' },
  stepText: { flex: 1, fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
});
