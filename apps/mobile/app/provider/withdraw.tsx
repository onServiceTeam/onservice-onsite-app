import React, { useEffect, useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
// Phase E CRIT-113 fix — withdraw screen no longer ships a fake
// EarningsChart that synthesised 7 identical bars from availableBalance/7.
// Now wired to the real /providers/me/earnings/trends endpoint, same
// shape the payouts and earnings screens use (CRIT-112 / CRIT-K08).
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWalletBalance } from '@/services/payment.service';
import api from '@/services/api';
import { Button, Input } from '@/components/ui';
// A7 — toast feedback instead of modal alerts.
import { showToast } from '@/lib/toast';
import { formatPHP } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';
import { Wallet, Building2 } from '@/components/icons';
// Phase 14 R5-complete — EarningsChart preview of recent earnings.
import EarningsChart from '@/components/provider/EarningsChart';
import { useResponsive } from '@/hooks/useResponsive';

const PAYOUT_METHODS = [
  { id: 'gcash', label: 'GCash', Icon: Wallet },
  { id: 'maya', label: 'Maya', Icon: Wallet },
  { id: 'bank_instapay', label: 'InstaPay', Icon: Building2 },
  { id: 'bank_pesonet', label: 'PESONet', Icon: Building2 },
] as const;

type PayoutMethod = typeof PAYOUT_METHODS[number]['id'];

interface PayoutPreferences {
  preferredMethod: string;
  destinationAccount: string | null;
}

function isPayoutMethod(value: string): value is PayoutMethod {
  return PAYOUT_METHODS.some((method) => method.id === value);
}

export default function WithdrawScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isPhone } = useResponsive();

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PayoutMethod | null>(null);
  const [account, setAccount] = useState('');
  const [preferencesApplied, setPreferencesApplied] = useState(false);

  const walletQuery = useQuery({
    queryKey: ['wallet'],
    queryFn: getWalletBalance,
    staleTime: 60 * 1000,
  });

  // UX-074 — the old Payout Settings page stored a preferred destination but
  // the withdrawal flow never read it. Saved details now prefill the manual
  // request and remain fully editable before any money movement is submitted.
  const payoutPreferencesQuery = useQuery<PayoutPreferences>({
    queryKey: ['payout-preferences'],
    queryFn: async () => {
      const res = await api.get<{ data: PayoutPreferences }>('/api/v1/wallet/payout-preferences');
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (preferencesApplied || !payoutPreferencesQuery.data) return;
    if (method === null && account.length === 0) {
      const saved = payoutPreferencesQuery.data;
      if (isPayoutMethod(saved.preferredMethod)) setMethod(saved.preferredMethod);
      if (saved.destinationAccount) setAccount(saved.destinationAccount);
    }
    setPreferencesApplied(true);
  }, [account.length, method, payoutPreferencesQuery.data, preferencesApplied]);

  // Phase E CRIT-113 fix — real /providers/me/earnings/trends data
  // for the chart preview (was 7 bars of availableBalance/7). 7-day
  // window since the chart sits next to a withdrawal action and the
  // most recent week is the most relevant context.
  const trendsQuery = useQuery<Array<{ period: string; netEarned: number }>>({
    queryKey: ['providerEarningsTrends', 'daily', 7],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{ period: string; netEarned: number | string }> }>(
        '/api/v1/providers/me/earnings/trends?period=daily&days=7',
      );
      return res.data.data.map((r) => ({
        period: r.period,
        netEarned: Number(r.netEarned) || 0,
      }));
    },
    staleTime: 60 * 1000,
  });

  // BUG-PHASE92-01 fix — pre-fix the form sent `account.trim()` raw.
  // The server's payout.service validateDestinationAccount enforces
  // /^09\d{9}$/ for gcash/maya (no spaces, no dashes) and /^\d{8,16}$/
  // for bank rails (digits only). The placeholder "09XX XXX XXXX"
  // encouraged providers to enter spaces — and "0917 555 1234" 4xx'd
  // with the friendly Zod-shaped error. Normalize by stripping every
  // non-digit before submit so the format the placeholder shows
  // round-trips successfully.
  const normalizeAccount = (raw: string): string => raw.replace(/\D+/g, '');

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const amountCentavos = Math.round(parseFloat(amount) * 100);
      const res = await api.post('/api/v1/wallet/withdraw', {
        amount: amountCentavos,
        method,
        destinationAccount: normalizeAccount(account),
      });
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
      void queryClient.invalidateQueries({ queryKey: ['walletTransactions'] });
      showToast('Withdrawal request recorded. Track its review status in Earnings.', 'success');
      router.back();
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      showToast(getErrorMessage(err, 'Failed to submit the withdrawal request.'), 'error');
    },
  });

  const availableBalance = walletQuery.data?.availableBalance ?? 0;
  const minWithdraw = platformConfig.minimumWithdrawalAmount;
  const amountCentavos = Math.round(parseFloat(amount || '0') * 100);

  const handleWithdraw = (): void => {
    if (!method) {
      showToast('Please select a payout method.', 'warning');
      return;
    }
    if (!account.trim()) {
      showToast('Please enter your account number or details.', 'warning');
      return;
    }
    if (amountCentavos < minWithdraw) {
      showToast(`Minimum withdrawal is ${formatPHP(minWithdraw)}.`, 'warning');
      return;
    }
    if (amountCentavos > availableBalance) {
      showToast('Amount exceeds your available balance.', 'warning');
      return;
    }

    Alert.alert(
      'Submit Withdrawal Request',
      `Request ${formatPHP(amountCentavos)} via ${PAYOUT_METHODS.find((m) => m.id === method)?.label}? The request enters manual review before any transfer is recorded.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => withdrawMutation.mutate() },
      ],
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Withdraw Funds</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, !isPhone && styles.scrollContentWide]}
        showsVerticalScrollIndicator={false}
        accessibilityLabel={isPhone ? 'Withdrawal request' : 'Desktop withdrawal request workspace'}
      >
        <View style={styles.balanceCard}>
          {walletQuery.isLoading ? (
            <ActivityIndicator size="large" color={colors.white} />
          ) : walletQuery.isError ? (
            <>
              <Text style={styles.balanceLabel}>Could not load balance</Text>
              <TouchableOpacity onPress={() => void walletQuery.refetch()}>
                <Text style={{ ...typography.bodySmall, color: colors.white, fontWeight: '600', marginTop: spacing.sm }}>Retry</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.balanceLabel}>Available Balance</Text>
              <Text style={styles.balanceAmount}>{formatPHP(availableBalance)}</Text>
            </>
          )}
        </View>

        {/* Phase E CRIT-113 fix — EarningsChart now driven by REAL
             7-day /trends data (was 7 identical bars of avail/7). */}
        {(trendsQuery.data?.length ?? 0) > 0 && (
          <View style={{ marginVertical: spacing.base }}>
            <EarningsChart
              data={(trendsQuery.data ?? []).map((row) => ({
                date: row.period.split('T')[0] ?? row.period,
                amount: row.netEarned,
              }))}
            />
          </View>
        )}

        <Text style={styles.sectionTitle}>Amount ({platformConfig.currencySymbol})</Text>
        <Input
          placeholder={`Min ${formatPHP(minWithdraw)}`}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
        />

        <TouchableOpacity
          style={styles.maxButton}
          onPress={() => setAmount((availableBalance / 100).toFixed(2))}
        >
          <Text style={styles.maxText}>Withdraw Max</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Payout Method</Text>
        <View style={styles.methodGrid}>
          {PAYOUT_METHODS.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.methodCard, method === m.id && styles.methodCardActive]}
              onPress={() => setMethod(m.id)}
            >
              <m.Icon size={28} color={method === m.id ? colors.secondary : colors.textSecondary} style={styles.methodIcon} />
              <Text style={[styles.methodLabel, method === m.id && styles.methodLabelActive]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {method && (
          <>
            <Text style={styles.sectionTitle}>
              {method.startsWith('bank_') ? 'Bank Account Number' : 'Phone Number'}
            </Text>
            {/* BUG-PHASE171-01 fix — pre-fix this Input had no
                maxLength. Server's withdrawalSchema caps
                destinationAccount at 255 (wallet.validators.ts:16).
                Match the cap. Same fix shape as Phase 145-150. */}
            <Input
              placeholder={method.startsWith('bank_') ? 'Account number' : '09XX XXX XXXX'}
              value={account}
              onChangeText={setAccount}
              keyboardType={method.startsWith('bank_') ? 'default' : 'phone-pad'}
              maxLength={255}
            />
          </>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.base }]}>
        <View style={[styles.bottomBarInner, !isPhone && styles.bottomBarInnerWide]}>
          <Text style={styles.reviewNote}>Requests are reviewed manually. Large amounts may enter an internal risk review.</Text>
          <Button
            title={withdrawMutation.isPending ? 'Submitting...' : 'Request Withdrawal'}
            onPress={handleWithdraw}
            loading={withdrawMutation.isPending}
            // BUG-PHASE46-01 fix — disabled condition pre-fix did NOT
            // include `!account.trim()`. Provider could fill amount
            // and method, leave account blank, hit Request Withdrawal,
            // and only get the "Account Required" alert at click time.
            // Inconsistent with the rest of the disabled gate (which
            // already checks method + amount). Now: button disabled
            // until all required fields are filled.
            disabled={
              withdrawMutation.isPending
              || !method
              || !amount
              || amountCentavos < minWithdraw
              || amountCentavos > availableBalance
              || !account.trim()
            }
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // App design refresh — soft canvas behind the white cards and inputs.
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: 120 },
  scrollContentWide: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: spacing.xl },

  balanceCard: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  balanceLabel: { ...typography.body, color: 'rgba(255,255,255,0.7)', marginBottom: spacing.xs },
  balanceAmount: { fontSize: 28, fontWeight: '800', color: colors.white },

  sectionTitle: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    fontWeight: '600',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },

  maxButton: { alignSelf: 'flex-end', marginTop: spacing.xs },
  maxText: { ...typography.bodySmall, color: colors.secondary, fontWeight: '600' },

  methodGrid: { flexDirection: 'row', gap: spacing.sm },
  // App design refresh — white surface tiles with a hairline border so they
  // lift off the soft canvas. The active state below overrides the border.
  methodCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  methodCardActive: { borderColor: colors.secondary, backgroundColor: colors.successLight },
  methodIcon: { marginBottom: spacing.xs },
  methodLabel: { ...typography.bodySmall, color: colors.text, fontWeight: '600' },
  methodLabelActive: { color: colors.secondary },

  bottomBar: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  bottomBarInner: { width: '100%' },
  bottomBarInnerWide: { maxWidth: 760, alignSelf: 'center' },
  reviewNote: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.sm },
});
