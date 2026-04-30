/**
 * Phase 14 Dispatch 12 — EarningsChart
 *
 * 7-day or 30-day bar visualisation of provider earnings (Bug 1207).
 * Implementation note: v1.0 uses pure-RN bars rendered as Views with
 * fractional flex; we deliberately avoid victory-native + react-native-svg
 * dep since the mobile app already has svg pulled at version 15.8.0
 * (incompatible with victory-native 36+ peer ranges). v1.1 may swap.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { formatPHP } from '@/utils/currency';

export interface EarningsPoint {
  /** ISO date string (yyyy-mm-dd). */
  date: string;
  /** Centavos. */
  amount: number;
}

export interface EarningsChartProps {
  data: EarningsPoint[];
  testID?: string;
}

const BAR_HEIGHT = 120;

export function EarningsChart({ data, testID }: EarningsChartProps): React.ReactElement {
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.amount)), [data]);
  const total = useMemo(() => data.reduce((s, d) => s + d.amount, 0), [data]);

  return (
    <View style={styles.container} testID={testID} accessibilityRole="image" accessibilityLabel={`Earnings chart for ${data.length} days, total ${formatPHP(total)}`}>
      <View style={styles.bars}>
        {data.map((point) => {
          const ratio = point.amount / max;
          return (
            <View key={point.date} style={styles.barColumn}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { height: Math.max(2, ratio * BAR_HEIGHT) },
                  ]}
                  accessibilityLabel={`${point.date}: ${formatPHP(point.amount)}`}
                />
              </View>
              <Text style={styles.barLabel}>
                {point.date.slice(5)}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Total</Text>
        <Text style={styles.summaryAmount}>{formatPHP(total)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    gap: spacing.sm,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: BAR_HEIGHT + 24,
    gap: 6,
  },
  barColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barTrack: { height: BAR_HEIGHT, justifyContent: 'flex-end', width: '80%' },
  barFill: {
    backgroundColor: colors.primary,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    width: '100%',
  },
  barLabel: { ...typography.caption, color: colors.textTertiary, marginTop: 4 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  summaryLabel: { ...typography.body, color: colors.textSecondary },
  summaryAmount: { ...typography.body, color: colors.text, fontWeight: '700' },
});

export default EarningsChart;
