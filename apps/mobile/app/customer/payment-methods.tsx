import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

const AVAILABLE_METHODS = [
  { type: 'gcash' as const, label: 'GCash', icon: '📱', desc: 'Pay via GCash e-wallet' },
  { type: 'maya' as const, label: 'Maya', icon: '💜', desc: 'Pay via Maya e-wallet' },
  { type: 'card' as const, label: 'Credit/Debit Card', icon: '💳', desc: 'Visa, Mastercard' },
  { type: 'qrph' as const, label: 'QR Ph', icon: '📷', desc: 'Scan to pay via QR Ph' },
  { type: 'wallet' as const, label: 'Wallet Balance', icon: '👛', desc: 'Pay using your onService wallet' },
];

export default function PaymentMethodsScreen(): React.ReactElement {
  const router = useRouter();

  const handleMethodInfo = (label: string): void => {
    const isWallet = label === 'Wallet Balance';
    Alert.alert(
      label,
      isWallet
        ? 'You can use your wallet balance to pay for bookings instantly at checkout. ' +
          'Top up your wallet from the Wallet tab.'
        : `${label} is available as a payment option during checkout. ` +
          'Your payment details are securely handled by PayMongo and never stored on our servers.',
      [{ text: 'OK' }],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={(): void => { router.back(); }} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Payment Methods</Text>
        <Text style={styles.subtitle}>
          Your payment details are securely processed by PayMongo. We never store your card numbers.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Available Payment Options</Text>
        <Text style={styles.sectionDesc}>
          Choose any of these methods during checkout. Payment is processed securely at the time of booking.
        </Text>

        {AVAILABLE_METHODS.map((m) => (
          <TouchableOpacity
            key={m.type}
            style={styles.methodCard}
            onPress={(): void => { handleMethodInfo(m.label); }}
          >
            <Text style={styles.methodIcon}>{m.icon}</Text>
            <View style={styles.methodInfo}>
              <Text style={styles.methodLabel}>{m.label}</Text>
              <Text style={styles.methodDesc}>{m.desc}</Text>
            </View>
            <Text style={styles.methodArrow}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>How Payments Work</Text>
        <Text style={styles.infoText}>
          When you book a service, your payment is held securely in escrow until the job is completed and confirmed.
          You can pay using GCash, Maya, credit/debit cards, QR Ph, or your wallet balance.
        </Text>
      </View>

      <View style={styles.escrowBox}>
        <Text style={styles.escrowTitle}>💰 Escrow Protection</Text>
        <Text style={styles.escrowText}>
          Your payment is not released to the provider until you confirm the job is complete.
          If there's an issue, you can file a dispute for a fair resolution.
        </Text>
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  content: { paddingBottom: spacing.xxl },

  header: { paddingHorizontal: spacing.base, paddingTop: spacing.xxl, paddingBottom: spacing.base },
  backBtn: { marginBottom: spacing.sm },
  backText: { ...typography.body, color: colors.primary },
  title: { ...typography.h2, color: colors.text },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },

  section: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.base,
    marginBottom: spacing.base,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  sectionDesc: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md },

  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  methodIcon: { fontSize: 24 },
  methodInfo: { flex: 1 },
  methodLabel: { ...typography.body, fontWeight: '600', color: colors.text },
  methodDesc: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  methodArrow: { ...typography.h2, color: colors.textTertiary },

  infoBox: {
    backgroundColor: colors.infoLight,
    marginHorizontal: spacing.base,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  infoTitle: { ...typography.body, fontWeight: '600', color: colors.infoDark, marginBottom: spacing.xs },
  infoText: { ...typography.bodySmall, color: colors.infoDark, lineHeight: 20 },

  escrowBox: {
    backgroundColor: colors.successLight,
    marginHorizontal: spacing.base,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  escrowTitle: { ...typography.body, fontWeight: '600', color: colors.success, marginBottom: spacing.xs },
  escrowText: { ...typography.bodySmall, color: colors.success, lineHeight: 20 },

  bottomSpacer: { height: 40 },
});
