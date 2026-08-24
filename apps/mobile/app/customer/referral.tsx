import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { getMyCode, getMyReferrals, redeemCode } from '@/services/referral.service';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';
import { ClipboardList, Gift, Send, ChevronLeft } from '@/components/icons';
// A7 — shared UI kit for loading/error states + toast feedback.
import { SkeletonCard, ErrorState, SectionHeader } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { useResponsive } from '@/hooks/useResponsive';

export default function ReferralScreen(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isPhone } = useResponsive();
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
      showToast('Referral code redeemed! A bonus has been added to your wallet.', 'success');
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Could not redeem referral code.';
      showToast(message, 'error');
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
      showToast(`Code "${code.code}" copied to clipboard.`, 'success');
    } catch {
      showToast('Could not copy to clipboard.', 'error');
    }
  };

  const isLoading = codeLoading || referralsLoading;
  const isError = codeError || referralsError;
  const refetchAll = (): void => { void refetchCode(); void refetchReferrals(); };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={[styles.headerInner, !isPhone && styles.headerInnerWide]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Referral Program</Text>
          <View style={styles.placeholder} />
        </View>
      </View>

      {isLoading ? (
        <View style={[styles.bodyContent, !isPhone && styles.bodyContentWide]}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : isError ? (
        <View style={[styles.stateContent, !isPhone && styles.stateContentWide]}>
          <ErrorState
            message="We couldn't load your referral program. Please check your connection and try again."
            onRetry={refetchAll}
          />
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}>
          <View
            style={[styles.workspace, !isPhone && styles.workspaceWide]}
            accessibilityLabel={isPhone ? 'Customer referral program' : 'Tablet and desktop customer referral workspace'}
          >
          <View style={[styles.workspaceColumn, !isPhone && styles.workspacePrimary]}>
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
              <Text style={styles.statValue}>{referrals?.summary?.totalReferrals ?? 0}</Text>
              <Text style={styles.statLabel}>Friends Referred</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatPHP(referrals?.summary?.totalEarned ?? 0)}</Text>
              <Text style={styles.statLabel}>Total Earned</Text>
            </View>
          </View>
          <Text style={styles.metricNote}>
            Total earned includes credited referral bonuses only. Pending bonuses are credited after the referred customer's first completed booking.
          </Text>
          </View>

          <View style={[styles.workspaceColumn, !isPhone && styles.workspaceSecondary]}>

          <View style={styles.redeemSection}>
            <SectionHeader title="Have a Referral Code?" />
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
              <SectionHeader title="Referral History" />
              {(referrals?.summary?.totalReferrals ?? 0) > (referrals?.redemptions.length ?? 0) && (
                <Text style={styles.historyScope}>
                  Showing the latest {referrals?.redemptions.length ?? 0} of {referrals?.summary?.totalReferrals ?? 0} referrals.
                </Text>
              )}
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
            <SectionHeader title="How It Works" />
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
          </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  headerInnerWide: { width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: spacing.xl },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  bodyContentWide: { width: '100%', maxWidth: 1120, alignSelf: 'center', padding: spacing.xl },
  stateContent: { flex: 1, padding: spacing.base },
  stateContentWide: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: spacing.xl },
  workspace: { width: '100%' },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  workspaceColumn: { minWidth: 0 },
  workspacePrimary: { flex: 1 },
  workspaceSecondary: { flex: 1 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroCard: { backgroundColor: colors.primaryDark, borderRadius: 16, padding: spacing.lg, alignItems: 'center', marginBottom: 20 },
  heroEmoji: { fontSize: 48, marginBottom: spacing.md },
  heroTitle: { fontSize: 20, fontWeight: '800', color: colors.white, marginBottom: spacing.sm, textAlign: 'center' },
  heroDesc: { fontSize: 14, color: colors.primaryLight, textAlign: 'center', lineHeight: 20 },
  codeCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: 20, alignItems: 'center', borderWidth: 2, borderColor: colors.info, borderStyle: 'dashed', marginBottom: spacing.base },
  codeLabel: { fontSize: 12, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm },
  codeText: { fontSize: 32, fontWeight: '900', color: colors.text, letterSpacing: 4, marginBottom: spacing.base },
  codeActions: { flexDirection: 'row', gap: spacing.md },
  copyBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: borderRadius.md, backgroundColor: colors.backgroundSecondary },
  copyBtnRow: { flexDirection: 'row' as const, alignItems: 'center' as const },
  copyBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 20, borderRadius: borderRadius.md, backgroundColor: colors.info },
  shareBtnText: { fontSize: 14, fontWeight: '600', color: colors.white },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },
  metricNote: { fontSize: 12, color: colors.textTertiary, lineHeight: 17, marginTop: -spacing.sm, marginBottom: spacing.lg },
  redeemSection: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 10 },
  redeemRow: { flexDirection: 'row', gap: 10 },
  redeemInput: { flex: 1, backgroundColor: colors.white, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, fontSize: 16, fontWeight: '600', color: colors.text, letterSpacing: 2, textAlign: 'center' },
  redeemBtn: { paddingHorizontal: spacing.lg, borderRadius: 12, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  redeemBtnDisabled: { opacity: 0.5 },
  redeemBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },
  section: { marginBottom: spacing.lg },
  historyScope: { fontSize: 12, color: colors.textTertiary, marginBottom: spacing.sm },
  historyItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: spacing.sm },
  historyLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  historyDate: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  historyAmount: { fontSize: 14, fontWeight: '700', color: colors.warning },
  historyAmountGreen: { color: colors.success },
  howItWorks: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.info, color: colors.white, fontSize: 14, fontWeight: '700', textAlign: 'center', lineHeight: 28, overflow: 'hidden' },
  stepText: { flex: 1, fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
});
