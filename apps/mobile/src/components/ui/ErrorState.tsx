import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { AlertTriangle } from '@/components/icons';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'We couldn\u2019t load this content. Please check your connection and try again.',
  onRetry,
  compact = false,
}: ErrorStateProps): React.ReactElement {
  return (
    <View
      style={[styles.container, compact && styles.containerCompact]}
      accessible={true}
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${message}`}
    >
      <View style={styles.iconWrap} accessibilityElementsHidden={true}>
        <AlertTriangle size={48} color={colors.error} />
      </View>
      <Text style={styles.title} maxFontSizeMultiplier={2}>{title}</Text>
      <Text style={styles.message} maxFontSizeMultiplier={2}>{message}</Text>
      {onRetry ? (
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={onRetry}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Retry loading"
        >
          <Text style={styles.retryText}>Try Again</Text>
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
  containerCompact: {
    flex: 0,
    paddingVertical: spacing.xl,
  },
  icon: {
    fontSize: 40,
    marginBottom: spacing.base,
  },
  iconWrap: {
    marginBottom: spacing.base,
    alignItems: 'center' as const,
  },
  title: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  message: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.base,
  },
  retryBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  retryText: {
    ...typography.body,
    color: colors.white,
    fontWeight: '600',
  },
});
