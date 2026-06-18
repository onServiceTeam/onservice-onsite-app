import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  Alert, ActivityIndicator, ScrollView, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getWalletBalance, topUpWallet } from '@/services/payment.service';
import { formatPHP } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography, borderRadius, getCategoryTint } from '@/config/theme';
import { SectionHeader, TrustStrip } from '@/components/ui';
import { platformConfig } from '@/config/platform.config';
import type { ComponentType } from 'react';
import { Smartphone, CreditCard, ScanLine, ChevronLeft, Check } from '@/components/icons';
// A7 — toast feedback instead of modal alerts.
import { showToast } from '@/lib/toast';

type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

const QUICK_AMOUNTS = [10000, 25000, 50000, 100000, 200000, 500000];

const PAYMENT_METHODS: { id: string; label: string; icon: IconComponent }[] = [
  { id: 'gcash', label: 'GCash', icon: Smartphone },
  { id: 'maya', label: 'Maya', icon: Smartphone },
  { id: 'card', label: 'Credit/Debit Card', icon: CreditCard },
  { id: 'qrph', label: 'QR Ph', icon: ScanLine },
];

export default function WalletTopUpScreen(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [customAmount, setCustomAmount] = useState('');
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [selectedMethod, setSelectedMethod] = useState('gcash');

  const walletQuery = useQuery({
    queryKey: ['wallet'],
    queryFn: getWalletBalance,
    staleTime: 60 * 1000,
  });
  const { isError: walletError } = walletQuery;

  const topUpMutation = useMutation({
    mutationFn: () => {
      const amount = selectedAmount ?? Math.round((Number(customAmount) || 0) * 100);
      return topUpWallet(amount, selectedMethod);
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
      void queryClient.invalidateQueries({ queryKey: ['walletTransactions'] });

      if (result.paymentIntent.checkoutUrl) {
        Alert.alert(
          'Complete Payment',
          `You will be redirected to ${selectedMethod === 'gcash' ? 'GCash' : selectedMethod === 'maya' ? 'Maya' : 'the payment page'} to complete your ${formatPHP(result.amount)} top-up.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Continue',
              onPress: () => {
                void Linking.openURL(result.paymentIntent.checkoutUrl!);
                router.back();
              },
            },
          ],
        );
      } else {
        showToast(result.message || 'Top-up initiated.', 'success');
        router.back();
      }
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      showToast(getErrorMessage(err, 'Could not process top-up.'), 'error');
    },
  });

  const activeAmount = selectedAmount ?? Math.round((Number(customAmount) || 0) * 100);
  const isValid = activeAmount >= platformConfig.minTopUp;

  const handleQuickAmount = (amount: number): void => {
    setSelectedAmount(amount);
    setCustomAmount('');
  };

  const handleCustomInput = (text: string): void => {
    setCustomAmount(text);
    setSelectedAmount(null);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Top Up Wallet</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Current Balance</Text>
          <Text style={styles.balanceAmount}>
            {walletQuery.data ? formatPHP(walletQuery.data.availableBalance) : '---'}
          </Text>
          {walletError && (
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 6 }}>Failed to load balance. Pull to refresh.</Text>
          )}
        </View>

        <SectionHeader title="Select Amount" />
        <View style={styles.quickGrid}>
          {QUICK_AMOUNTS.map((amount) => (
            <TouchableOpacity
              key={amount}
              style={[styles.quickBtn, selectedAmount === amount && styles.quickBtnSelected]}
              onPress={() => handleQuickAmount(amount)}
            >
              <Text style={[styles.quickBtnText, selectedAmount === amount && styles.quickBtnTextSelected]}>
                {formatPHP(amount)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.customRow}>
          <Text style={styles.customPrefix}>{platformConfig.currencySymbol}</Text>
          <TextInput
            style={styles.customInput}
            keyboardType="numeric"
            placeholder="Or enter custom amount"
            placeholderTextColor={colors.textTertiary}
            value={customAmount}
            onChangeText={handleCustomInput}
          />
        </View>
        {activeAmount > 0 && activeAmount < platformConfig.minTopUp && (
          <Text style={styles.minWarn}>Minimum top-up: {formatPHP(platformConfig.minTopUp)}</Text>
        )}
        {activeAmount > platformConfig.maxTopUp && (
          <Text style={styles.minWarn}>Maximum top-up: {formatPHP(platformConfig.maxTopUp)} per transaction</Text>
        )}

        <SectionHeader title="Payment Method" style={{ marginTop: spacing.lg }} />
        {PAYMENT_METHODS.map((method) => {
          const MIcon = method.icon;
          const tint = getCategoryTint(method.id);
          return (
          <TouchableOpacity
            key={method.id}
            style={[styles.methodOption, selectedMethod === method.id && styles.methodSelected]}
            onPress={() => setSelectedMethod(method.id)}
          >
            <View style={[styles.methodIconWrap, { backgroundColor: tint.bg }]}><MIcon size={20} color={tint.fg} /></View>
            <Text style={[styles.methodText, selectedMethod === method.id && styles.methodTextSelected]}>
              {method.label}
            </Text>
            {selectedMethod === method.id && <Check size={18} color={colors.primary} style={{ marginLeft: 'auto' }} />}
          </TouchableOpacity>
          );
        })}

        <TrustStrip style={styles.trustStrip} />

        <View style={styles.footer}>
          {topUpMutation.isPending ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Processing...</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.topUpBtn,
                (!isValid || activeAmount > platformConfig.maxTopUp) && styles.topUpBtnDisabled,
              ]}
              onPress={() => topUpMutation.mutate()}
              disabled={!isValid || activeAmount > platformConfig.maxTopUp}
            >
              {/* BUG-PHASE47-02 fix — pre-fix the button label said
                  "Add ₱X to Wallet" even when the amount exceeded
                  maxTopUp, looking tappable but actually disabled.
                  Confusing — the user couldn't tell why the button
                  did nothing. Now: the over-max state has its own
                  label so the disabled-looking button matches its
                  disabled-state copy. */}
              <Text style={styles.topUpBtnText}>
                {!isValid
                  ? 'Select an Amount'
                  : activeAmount > platformConfig.maxTopUp
                    ? `Maximum ${formatPHP(platformConfig.maxTopUp)} per top-up`
                    : `Add ${formatPHP(activeAmount)} to Wallet`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },

  balanceCard: {
    backgroundColor: colors.primary, borderRadius: borderRadius.xl,
    padding: spacing.lg, alignItems: 'center', marginBottom: spacing.lg,
  },
  balanceLabel: { ...typography.bodySmall, color: 'rgba(255,255,255,0.7)', marginBottom: spacing.xs },
  balanceAmount: { fontSize: 28, fontWeight: '800', color: colors.white },

  sectionTitle: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: spacing.md },

  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickBtn: {
    width: '31%', paddingVertical: spacing.md, borderRadius: borderRadius.md,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
    backgroundColor: colors.surface,
  },
  quickBtnSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  quickBtnText: { ...typography.body, fontWeight: '600', color: colors.textSecondary },
  quickBtnTextSelected: { color: colors.primary },

  customRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.border,
    borderRadius: borderRadius.md, paddingHorizontal: spacing.base,
    backgroundColor: colors.surface, marginTop: spacing.md,
  },
  customPrefix: { fontSize: 20, fontWeight: '700', color: colors.textSecondary, marginRight: spacing.xs },
  customInput: {
    flex: 1, paddingVertical: spacing.md, fontSize: 18, fontWeight: '600', color: colors.text,
  },
  minWarn: { ...typography.caption, color: colors.error, marginTop: spacing.xs },

  methodOption: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md,
    paddingHorizontal: spacing.base, borderRadius: borderRadius.md,
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  methodSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  methodIcon: { fontSize: 20, marginRight: spacing.md },
  methodIconWrap: {
    marginRight: spacing.md,
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  methodText: { ...typography.body, color: colors.textSecondary, flex: 1 },
  methodTextSelected: { color: colors.primary, fontWeight: '600' },
  methodCheck: { fontSize: 16, color: colors.primary, fontWeight: '700' },

  trustStrip: { marginTop: spacing.lg },
  footer: { marginTop: spacing.md },
  topUpBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingVertical: spacing.md + 2, alignItems: 'center',
  },
  topUpBtnDisabled: { opacity: 0.4 },
  topUpBtnText: { ...typography.body, fontWeight: '700', color: colors.white },
  loadingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: spacing.md,
  },
  loadingText: { ...typography.body, color: colors.primary },
});
