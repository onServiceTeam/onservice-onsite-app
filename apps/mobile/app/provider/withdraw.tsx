import React, { useState } from 'react';
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
import { formatPHP } from '@/utils/currency';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';

const PAYOUT_METHODS = [
  { id: 'gcash', label: 'GCash', icon: '💚' },
  { id: 'maya', label: 'Maya', icon: '💜' },
  { id: 'bank_instapay', label: 'InstaPay', icon: '🏦' },
  { id: 'bank_pesonet', label: 'PESONet', icon: '🏦' },
] as const;

type PayoutMethod = typeof PAYOUT_METHODS[number]['id'];

export default function WithdrawScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PayoutMethod | null>(null);
  const [account, setAccount] = useState('');

  const walletQuery = useQuery({
    queryKey: ['wallet'],
    queryFn: getWalletBalance,
    staleTime: 60 * 1000,
  });

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const amountCentavos = Math.round(parseFloat(amount) * 100);
      const res = await api.post('/api/v1/wallets/withdraw', {
        amount: amountCentavos,
        method,
        destinationAccount: account.trim(),
      });
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
      void queryClient.invalidateQueries({ queryKey: ['walletTransactions'] });
      Alert.alert('Withdrawal Requested', 'Your withdrawal is being processed.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      Alert.alert('Error', axErr?.response?.data?.error?.message ?? 'Failed to process withdrawal.');
    },
  });

  const availableBalance = walletQuery.data?.availableBalance ?? 0;
  const minWithdraw = platformConfig.minimumWithdrawalAmount;
  const amountCentavos = Math.round(parseFloat(amount || '0') * 100);

  const handleWithdraw = (): void => {
    if (!method) {
      Alert.alert('Select Method', 'Please select a payout method.');
      return;
    }
    if (!account.trim()) {
      Alert.alert('Account Required', 'Please enter your account number or details.');
      return;
    }
    if (amountCentavos < minWithdraw) {
      Alert.alert('Minimum Amount', `Minimum withdrawal is ${formatPHP(minWithdraw)}.`);
      return;
    }
    if (amountCentavos > availableBalance) {
      Alert.alert('Insufficient Balance', 'Amount exceeds your available balance.');
      return;
    }

    Alert.alert(
      'Confirm Withdrawal',
      `Withdraw ${formatPHP(amountCentavos)} via ${PAYOUT_METHODS.find((m) => m.id === method)?.label}?`,
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

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
              <Text style={styles.methodIcon}>{m.icon}</Text>
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
            <Input
              placeholder={method.startsWith('bank_') ? 'Account number' : '09XX XXX XXXX'}
              value={account}
              onChangeText={setAccount}
              keyboardType={method.startsWith('bank_') ? 'default' : 'phone-pad'}
            />
          </>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.base }]}>
        <Button
          title={withdrawMutation.isPending ? 'Processing...' : 'Request Withdrawal'}
          onPress={handleWithdraw}
          loading={withdrawMutation.isPending}
          disabled={withdrawMutation.isPending || !method || !amount || amountCentavos < minWithdraw}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
  title: { ...typography.h3, color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: 120 },

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
  methodCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.base,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  methodCardActive: { borderColor: colors.secondary, backgroundColor: colors.successLight },
  methodIcon: { fontSize: 28, marginBottom: spacing.xs },
  methodLabel: { ...typography.bodySmall, color: colors.text, fontWeight: '600' },
  methodLabelActive: { color: colors.secondary },

  bottomBar: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
});
