import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, borderRadius } from '@/config/theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  padded?: boolean;
}

// App design refresh (2026-06) — a white surface card with a hairline border
// and rounded corners, meant to sit on the soft `surfaceMuted` screen canvas.
// Replaces the ad-hoc inline card Views scattered across screens.
export default function Card({ children, style, padded = true }: CardProps): React.ReactElement {
  return <View style={[styles.card, padded && styles.padded, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  padded: { padding: spacing.base },
});
