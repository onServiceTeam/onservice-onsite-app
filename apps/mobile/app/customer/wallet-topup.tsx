import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  Alert, ActivityIndicator, ScrollView, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getWalletBalance, topUpWallet } from '@/services/payment.service';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';
import type { ComponentType } from 'react';
import { Smartphone, CreditCard, ScanLine } from '@/components/icons';

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
        Alert.alert('Top-Up Initiated', result.message, [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      Alert.alert('Top-Up Failed', axErr?.response?.data?.error?.message ?? axErr?.message ?? 'Could not process top-up.');
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
          <Text style={styles.backText}>←</Text>
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

        <Text style={styles.sectionTitle}>Select Amount</Text>
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

        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Payment Method</Text>
        {PAYMENT_METHODS.map((method) => {
          const MIcon = method.icon;
          return (
          <TouchableOpacity
            key={method.id}
            style={[styles.methodOption, selectedMethod === method.id && styles.methodSelected]}
            onPress={() => setSelectedMethod(method.id)}
          >
            <View style={styles.methodIconWrap}><MIcon size={20} color={colors.primary} /></View>
            <Text style={[styles.methodText, selectedMethod === method.id && styles.methodTextSelected]}>
              {method.label}
            </Text>
            {selectedMethod === method.id && <Text style={styles.methodCheck}>✓</Text>}
          </TouchableOpacity>
          );
        })}

        <View style={styles.footer}>
          {topUpMutation.isPending ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Processing...</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.topUpBtn, !isValid && styles.topUpBtnDisabled]}
              onPress={() => topUpMutation.mutate()}
              disabled={!isValid || activeAmount > platformConfig.maxTopUp}
            >
              <Text style={styles.topUpBtnText}>
                {isValid ? `Add ${formatPHP(activeAmount)} to Wallet` : 'Select an Amount'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: colors.border,
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
    backgroundColor: colors.backgroundSecondary,
  },
  quickBtnSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  quickBtnText: { ...typography.body, fontWeight: '600', color: colors.textSecondary },
  quickBtnTextSelected: { color: colors.primary },

  customRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.border,
    borderRadius: borderRadius.md, paddingHorizontal: spacing.base,
    backgroundColor: colors.backgroundSecondary, marginTop: spacing.md,
  },
  customPrefix: { fontSize: 20, fontWeight: '700', color: colors.textSecondary, marginRight: spacing.xs },
  customInput: {
    flex: 1, paddingVertical: spacing.md, fontSize: 18, fontWeight: '600', color: colors.text,
  },
  minWarn: { ...typography.caption, color: colors.error, marginTop: spacing.xs },

  methodOption: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md,
    paddingHorizontal: spacing.base, borderRadius: borderRadius.md,
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.backgroundSecondary,
    marginBottom: spacing.sm,
  },
  methodSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  methodIcon: { fontSize: 20, marginRight: spacing.md },
  methodIconWrap: { marginRight: spacing.md, width: 28, alignItems: 'center' as const },
  methodText: { ...typography.body, color: colors.textSecondary, flex: 1 },
  methodTextSelected: { color: colors.primary, fontWeight: '600' },
  methodCheck: { fontSize: 16, color: colors.primary, fontWeight: '700' },

  footer: { marginTop: spacing.lg },
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
