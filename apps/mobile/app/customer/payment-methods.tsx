import React from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, typography, borderRadius, getCategoryTint } from '@/config/theme';
import { Card, SectionHeader, TrustStrip } from '@/components/ui';
import type { ComponentType } from 'react';
import { Smartphone, CreditCard, ScanLine, Wallet, AlertTriangle, Lock } from '@/components/icons';
import { useResponsive } from '@/hooks/useResponsive';
import { showToast } from '@/lib/toast';

type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

const PAYMENT_METHODS: ReadonlyArray<{ type: string; label: string; icon: IconComponent; desc: string; available: boolean }> = [
  { type: 'wallet', label: 'Existing Wallet Balance', icon: Wallet, desc: 'Available at checkout when your current balance covers the total', available: true },
  { type: 'gcash', label: 'GCash', icon: Smartphone, desc: 'New authorization temporarily paused', available: false },
  { type: 'maya', label: 'Maya', icon: Smartphone, desc: 'New authorization temporarily paused', available: false },
  { type: 'card', label: 'Credit/Debit Card', icon: CreditCard, desc: 'New authorization temporarily paused', available: false },
  { type: 'qrph', label: 'QR Ph', icon: ScanLine, desc: 'New authorization temporarily paused', available: false },
];

export default function PaymentMethodsScreen(): React.ReactElement {
  const router = useRouter();
  const { isPhone } = useResponsive();

  const handleMethodInfo = (method: (typeof PAYMENT_METHODS)[number]): void => {
    showToast(
      method.available
        ? 'Your existing onService wallet balance can be selected at checkout when it covers the full booking total. New wallet top-ups are temporarily unavailable.'
        : `${method.label} authorization is temporarily unavailable while the external payment flow is corrected. No payment will be created from this information screen.`,
      method.available ? 'info' : 'warning',
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, !isPhone && styles.contentWide]}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back from payment methods" onPress={(): void => { router.back(); }} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Payment Methods</Text>
        <Text style={styles.subtitle}>
          Existing wallet balance is the only payment option currently enabled. External authorization is paused while its handoff is corrected.
        </Text>
      </View>

      <TrustStrip style={styles.trustStrip} />

      <View
        style={[styles.workspace, !isPhone && styles.workspaceWide]}
        accessibilityLabel={isPhone ? 'Payment methods' : 'Desktop payment methods workspace'}
      >
        <Card style={[styles.section, styles.methodSection]}>
          <SectionHeader title="Current payment options" />
          <Text style={styles.sectionDesc}>
            This page shows availability only. Select and confirm payment from an eligible booking checkout.
          </Text>

          {PAYMENT_METHODS.map((m) => {
            const MIcon = m.icon;
            const tint = getCategoryTint(m.type);
            return (
              <TouchableOpacity
                key={m.type}
                style={[styles.methodCard, !m.available && styles.methodCardPaused]}
                onPress={(): void => { handleMethodInfo(m); }}
                accessibilityRole="button"
                accessibilityLabel={`${m.label}, ${m.available ? 'available' : 'paused'}`}
              >
                <View style={[styles.methodIconWrap, { backgroundColor: tint.bg }]}><MIcon size={24} color={tint.fg} /></View>
                <View style={styles.methodInfo}>
                  <Text style={styles.methodLabel}>{m.label}</Text>
                  <Text style={styles.methodDesc}>{m.desc}</Text>
                </View>
                <View style={[styles.statusPill, m.available ? styles.statusAvailable : styles.statusPaused]}>
                  <Text style={styles.statusText}>{m.available ? 'Available' : 'Paused'}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </Card>

        <View style={[styles.rail, !isPhone && styles.railWide]}>
          <View style={styles.holdBox} accessibilityRole="alert">
            <View style={styles.boxTitleRow}>
              <AlertTriangle size={20} color={colors.warning} />
              <Text style={styles.holdTitle}>External payments paused</Text>
            </View>
            <Text style={styles.holdText}>
              Card, GCash, Maya, QR Ph, bank transfer, and new wallet top-ups do not currently create a payment. Do not retry an old hosted link or treat a browser redirect as proof of payment.
            </Text>
          </View>

          <View style={styles.infoBox}>
            <View style={styles.boxTitleRow}>
              <Lock size={18} color={colors.infoDark} />
              <Text style={styles.infoTitle}>Verify the booking record</Text>
            </View>
            <Text style={styles.infoText}>
              Only a booking that shows paid and held has verified escrow. You can confirm the job or open a dispute from that booking. Support checks the payment and escrow record before promising any refund.
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { paddingBottom: spacing.xxl },
  contentWide: { width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: spacing.xl },

  header: { paddingHorizontal: spacing.base, paddingTop: spacing.xxl, paddingBottom: spacing.base },
  backBtn: { padding: spacing.xs, marginBottom: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { ...typography.body, color: colors.primary },
  title: { ...typography.h2, color: colors.text },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },

  trustStrip: { marginHorizontal: spacing.base, marginBottom: spacing.base },

  workspace: { paddingHorizontal: spacing.base },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  section: { marginBottom: spacing.base },
  methodSection: { flex: 1, minWidth: 0 },
  rail: { gap: spacing.base },
  railWide: { width: 340, minWidth: 0 },
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
  methodCardPaused: { backgroundColor: colors.backgroundSecondary },
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
  statusPill: { borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  statusAvailable: { backgroundColor: colors.successLight },
  statusPaused: { backgroundColor: colors.warningLight },
  statusText: { ...typography.caption, color: colors.text, fontWeight: '700' },

  infoBox: {
    backgroundColor: colors.infoLight,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  boxTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  infoTitle: { ...typography.body, fontWeight: '600', color: colors.infoDark, marginBottom: spacing.xs },
  infoText: { ...typography.bodySmall, color: colors.infoDark, lineHeight: 20 },

  holdBox: {
    backgroundColor: colors.warningLight,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  holdTitle: { ...typography.body, fontWeight: '700', color: colors.text },
  holdText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },

  bottomSpacer: { height: 40 },
});
