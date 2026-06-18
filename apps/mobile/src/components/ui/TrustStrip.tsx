import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ShieldCheck, Lock, Clock } from '@/components/icons';

interface TrustStripProps {
  style?: ViewStyle;
}

// App design refresh (2026-06) — the three-part trust line (vetted pros, escrow,
// 48h cover) that anchors the value proposition. Used on the home header and the
// checkout / payment surfaces. Informational only, no insurance language.
export default function TrustStrip({ style }: TrustStripProps): React.ReactElement {
  return (
    <View
      style={[styles.wrap, style]}
      accessibilityLabel="Vetted pros, payment held in escrow, 48 hour guarantee"
    >
      <View style={styles.item}>
        <ShieldCheck size={15} color={colors.primary} />
        <Text style={styles.txt}>Vetted pros</Text>
      </View>
      <View style={styles.dot} />
      <View style={styles.item}>
        <Lock size={15} color={colors.primary} />
        <Text style={styles.txt}>Escrow</Text>
      </View>
      <View style={styles.dot} />
      <View style={styles.item}>
        <Clock size={15} color={colors.primary} />
        <Text style={styles.txt}>48h cover</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  txt: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.primary, opacity: 0.4 },
});
