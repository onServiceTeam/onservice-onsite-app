import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ShieldCheck, Lock, Scale } from '@/components/icons';

interface TrustStripProps {
  style?: ViewStyle;
}

// Shared factual trust line. It describes controls that exist without turning
// the unresolved E10/E18 protection and settlement work into a guarantee.
export default function TrustStrip({ style }: TrustStripProps): React.ReactElement {
  return (
    <View
      style={[styles.wrap, style]}
      accessibilityLabel="Vetted pros, verified payments use escrow, in-app case tracking"
    >
      <View style={styles.item}>
        <ShieldCheck size={15} color={colors.primary} />
        <Text style={styles.txt}>Vetted pros</Text>
      </View>
      <View style={styles.dot} />
      <View style={styles.item}>
        <Lock size={15} color={colors.primary} />
        <Text style={styles.txt}>Verified escrow</Text>
      </View>
      <View style={styles.dot} />
      <View style={styles.item}>
        <Scale size={15} color={colors.primary} />
        <Text style={styles.txt}>Case tracking</Text>
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
