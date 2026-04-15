import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

interface BadgeProps {
  label: string;
  color?: string;
  backgroundColor?: string;
  size?: 'sm' | 'md';
}

export default function Badge({
  label,
  color = '#FFFFFF',
  backgroundColor = colors.primary,
  size = 'sm',
}: BadgeProps) {
  return (
    <View
      style={[styles.base, { backgroundColor }, size === 'md' && styles.md]}
      accessible={true}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Text
        style={[styles.text, { color }, size === 'md' && styles.textMd]}
        maxFontSizeMultiplier={2}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    alignSelf: 'flex-start',
  },
  md: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  text: { ...typography.caption, fontWeight: '600' },
  textMd: { fontSize: 13 },
});
