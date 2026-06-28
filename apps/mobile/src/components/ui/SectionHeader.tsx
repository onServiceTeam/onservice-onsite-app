import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, typography } from '@/config/theme';

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

// App design refresh (2026-06) — a consistent section title row with an optional
// right-aligned action ("See all"). Keeps spacing and type uniform across screens.
export default function SectionHeader({
  title,
  actionLabel,
  onAction,
  style,
}: SectionHeaderProps): React.ReactElement {
  return (
    <View style={[styles.row, style]}>
      <Text style={styles.title}>{title}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} accessibilityRole="button" accessibilityLabel={actionLabel} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
          <Text style={styles.action}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { ...typography.h3, color: colors.text },
  action: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },
});
