/**
 * Phase 14 Dispatch 12 — Pattern: money-card breakdown disclosure.
 *
 * Provider earnings screen (Bug 1206) and job detail money card render
 * the same gross → fee → commission → net breakdown. This component
 * encapsulates the formatting + accessibility + the "Where does each
 * line come from?" disclosure modal that the spec calls for in
 * Part 2C section 12.
 */

import React, { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, ScrollView } from 'react-native';
import { colors, spacing, borderRadius, typography } from '@/config/theme';
import { formatPHP } from '@/utils/currency';

export interface CommissionLine {
  label: string;
  amount: number;
  /** Percentage when this line is a deduction (e.g. 12 for "Platform fee 12%"). */
  pct?: number;
  helpText?: string;
}

export interface CommissionBreakdownProps {
  gross: number;
  lines: CommissionLine[];
  net: number;
  testID?: string;
}

export function CommissionBreakdown({
  gross,
  lines,
  net,
  testID,
}: CommissionBreakdownProps): React.ReactElement {
  const [helpVisible, setHelpVisible] = useState(false);

  return (
    <View style={styles.card} testID={testID} accessibilityRole="summary">
      <View style={styles.row}>
        <Text style={styles.label}>Gross</Text>
        <Text style={styles.amount}>{formatPHP(gross)}</Text>
      </View>
      {lines.map((line) => (
        <View key={line.label} style={styles.row}>
          <Text style={styles.label}>
            {line.label}
            {line.pct !== undefined ? ` (${line.pct}%)` : ''}
          </Text>
          <Text style={styles.amountDeduction}>−{formatPHP(line.amount)}</Text>
        </View>
      ))}
      <View style={styles.divider} />
      <View style={styles.row}>
        <Text style={styles.netLabel}>Net to you</Text>
        <Text style={styles.netAmount}>{formatPHP(net)}</Text>
      </View>
      <Pressable
        onPress={() => setHelpVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="Where does each line come from?"
        style={styles.helpLink}
      >
        <Text style={styles.helpText}>Where does each line come from?</Text>
      </Pressable>
      <Modal
        visible={helpVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setHelpVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>How your earnings are calculated</Text>
            <ScrollView style={{ marginVertical: spacing.sm }}>
              <Text style={styles.modalBody}>
                Gross is the amount the customer paid. We deduct platform fees,
                tax, and any tip going to the customer's preferred routing. The
                net amount is what reaches your wallet on next payout.
              </Text>
              {lines.map((line) => (
                <View key={`help-${line.label}`} style={{ marginTop: spacing.sm }}>
                  <Text style={styles.modalLine}>
                    {line.label}
                    {line.pct !== undefined ? ` (${line.pct}%)` : ''}
                  </Text>
                  {line.helpText ? (
                    <Text style={styles.modalLineDetail}>{line.helpText}</Text>
                  ) : null}
                </View>
              ))}
            </ScrollView>
            <Pressable
              onPress={() => setHelpVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.modalClose}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { ...typography.body, color: colors.textSecondary },
  amount: { ...typography.body, color: colors.text, fontWeight: '600' },
  amountDeduction: { ...typography.body, color: colors.textSecondary },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.xs },
  netLabel: { ...typography.body, color: colors.text, fontWeight: '700' },
  netAmount: { ...typography.h3, color: colors.successDark, fontWeight: '700' },
  helpLink: { paddingTop: spacing.xs },
  helpText: { ...typography.bodySmall, color: colors.primary, textDecorationLine: 'underline' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    maxHeight: '80%',
  },
  modalTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.sm },
  modalBody: { ...typography.body, color: colors.textSecondary },
  modalLine: { ...typography.bodySmall, color: colors.text, fontWeight: '600' },
  modalLineDetail: { ...typography.caption, color: colors.textSecondary },
  modalClose: { backgroundColor: colors.primary, padding: spacing.md, borderRadius: borderRadius.md, alignItems: 'center' },
  modalCloseText: { ...typography.button, color: colors.white },
});

export default CommissionBreakdown;
