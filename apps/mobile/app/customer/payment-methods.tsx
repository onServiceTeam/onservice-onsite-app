import React from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, typography, borderRadius, getCategoryTint } from '@/config/theme';
import { Card, SectionHeader, TrustStrip } from '@/components/ui';
import type { ComponentType } from 'react';
import { Smartphone, CreditCard, ScanLine, Wallet, Coins } from '@/components/icons';

type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

const AVAILABLE_METHODS: ReadonlyArray<{ type: string; label: string; icon: IconComponent; desc: string }> = [
  { type: 'gcash', label: 'GCash', icon: Smartphone, desc: 'Pay via GCash e-wallet' },
  { type: 'maya', label: 'Maya', icon: Smartphone, desc: 'Pay via Maya e-wallet' },
  { type: 'card', label: 'Credit/Debit Card', icon: CreditCard, desc: 'Visa, Mastercard' },
  { type: 'qrph', label: 'QR Ph', icon: ScanLine, desc: 'Scan to pay via QR Ph' },
  { type: 'wallet', label: 'Wallet Balance', icon: Wallet, desc: 'Pay using your onService wallet' },
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

      <TrustStrip style={styles.trustStrip} />

      <Card style={styles.section}>
        <SectionHeader title="Available Payment Options" />
        <Text style={styles.sectionDesc}>
          Choose any of these methods during checkout. Payment is processed securely at the time of booking.
        </Text>

        {AVAILABLE_METHODS.map((m) => {
          const MIcon = m.icon;
          const tint = getCategoryTint(m.type);
          return (
            <TouchableOpacity
              key={m.type}
              style={styles.methodCard}
              onPress={(): void => { handleMethodInfo(m.label); }}
            >
              <View style={[styles.methodIconWrap, { backgroundColor: tint.bg }]}><MIcon size={24} color={tint.fg} /></View>
              <View style={styles.methodInfo}>
                <Text style={styles.methodLabel}>{m.label}</Text>
                <Text style={styles.methodDesc}>{m.desc}</Text>
              </View>
              <Text style={styles.methodArrow}>›</Text>
            </TouchableOpacity>
          );
        })}
      </Card>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>How Payments Work</Text>
        <Text style={styles.infoText}>
          When you book a service, your payment is held securely in escrow until the job is completed and confirmed.
          You can pay using GCash, Maya, credit/debit cards, QR Ph, or your wallet balance.
        </Text>
      </View>

      <View style={styles.escrowBox}>
        <View style={styles.escrowTitleRow}>
          <Coins size={18} color={colors.primary} />
          <Text style={styles.escrowTitle}> Escrow Protection</Text>
        </View>
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
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { paddingBottom: spacing.xxl },

  header: { paddingHorizontal: spacing.base, paddingTop: spacing.xxl, paddingBottom: spacing.base },
  backBtn: { padding: spacing.xs, marginBottom: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { ...typography.body, color: colors.primary },
  title: { ...typography.h2, color: colors.text },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },

  trustStrip: { marginHorizontal: spacing.base, marginBottom: spacing.base },

  section: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.base,
  },
  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  sectionDesc: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md },

  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  methodIcon: { fontSize: 24 },
  methodIconWrap: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
  },
  escrowTitleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: spacing.xs },
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
    backgroundColor: colors.primaryLight,
    marginHorizontal: spacing.base,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  escrowTitle: { ...typography.body, fontWeight: '600', color: colors.primary, marginBottom: spacing.xs },
  escrowText: { ...typography.bodySmall, color: colors.primary, lineHeight: 20 },

  bottomSpacer: { height: 40 },
});
