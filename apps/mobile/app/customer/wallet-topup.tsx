import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getWalletBalance } from '@/services/payment.service';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ChevronLeft, Lock } from '@/components/icons';

/**
 * E14 containment: the former screen collected an amount and payment method,
 * created a PayMongo Payment Intent, then opened a constructed checkout URL
 * that PayMongo does not provide. Keep the balance useful, but expose no
 * control that can create another stuck top-up attempt.
 */
export default function WalletTopUpScreen(): React.ReactElement {
  const router = useRouter();
  const walletQuery = useQuery({
    queryKey: ['wallet'],
    queryFn: getWalletBalance,
    staleTime: 60 * 1000,
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Top Up Wallet</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View style={styles.contentColumn}>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Current Balance</Text>
            <Text style={styles.balanceAmount}>
              {walletQuery.data ? formatPHP(walletQuery.data.availableBalance) : '---'}
            </Text>
            {walletQuery.isError ? (
              <Text style={styles.balanceError}>We could not load your balance. Please try again later.</Text>
            ) : null}
          </View>

          <View style={styles.holdCard} accessibilityRole="alert">
            <View style={styles.holdIcon}>
              <Lock size={22} color={colors.warning} />
            </View>
            <View style={styles.holdCopy}>
              <Text style={styles.holdTitle}>Wallet top-ups are temporarily unavailable</Text>
              <Text style={styles.holdText}>
                GCash, Maya, card, and QR Ph top-ups are paused while we correct the payment authorization flow. No payment has been created and your current balance is unchanged.
              </Text>
              <Text style={styles.holdSupport}>
                You can still review your wallet and use an existing balance. Contact support if a previous top-up is still showing as pending.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.backAction}
            onPress={() => router.back()}
            accessibilityRole="button"
          >
            <Text style={styles.backActionText}>Back to Wallet</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 44 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: spacing.xxl },
  contentColumn: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  balanceCard: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  balanceLabel: { ...typography.bodySmall, color: 'rgba(255,255,255,0.75)', marginBottom: spacing.xs },
  balanceAmount: { fontSize: 28, fontWeight: '800', color: colors.white },
  balanceError: { ...typography.caption, color: colors.white, marginTop: spacing.sm, textAlign: 'center' },
  holdCard: {
    flexDirection: 'row',
    backgroundColor: colors.warningLight,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  holdIcon: { marginRight: spacing.md, paddingTop: 2 },
  holdCopy: { flex: 1 },
  holdTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.sm },
  holdText: { ...typography.bodySmall, color: colors.text, lineHeight: 20 },
  holdSupport: { ...typography.caption, color: colors.textSecondary, lineHeight: 18, marginTop: spacing.md },
  backAction: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  backActionText: { ...typography.body, color: colors.white, fontWeight: '700' },
});
