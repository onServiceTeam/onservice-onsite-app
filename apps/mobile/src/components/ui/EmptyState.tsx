import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Inbox } from '@/components/icons';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon = <Inbox size={48} color={colors.textTertiary} />,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps): React.ReactElement {
  return (
    <View
      style={styles.container}
      accessible={true}
      accessibilityRole="text"
      accessibilityLabel={description ? `${title}. ${description}` : title}
    >
      <View style={styles.icon} accessibilityElementsHidden={true}>{icon}</View>
      <Text style={styles.title} maxFontSizeMultiplier={2}>{title}</Text>
      {description ? (
        <Text style={styles.description} maxFontSizeMultiplier={2}>{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <TouchableOpacity style={styles.actionBtn} onPress={onAction} activeOpacity={0.7}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl + spacing.base,
  },
  icon: {
    marginBottom: spacing.base,
  },
  title: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  description: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  actionBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  actionText: {
    ...typography.body,
    color: colors.white,
    fontWeight: '600',
  },
});
