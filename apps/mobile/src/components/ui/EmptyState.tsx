import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/config/theme';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
}

export function EmptyState({
  icon = '📭',
  title,
  description,
}: EmptyStateProps): React.ReactElement {
  return (
    <View
      style={styles.container}
      accessible={true}
      accessibilityRole="text"
      accessibilityLabel={description ? `${title}. ${description}` : title}
    >
      <Text style={styles.icon} accessibilityElementsHidden={true}>{icon}</Text>
      <Text style={styles.title} maxFontSizeMultiplier={2}>{title}</Text>
      {description ? (
        <Text style={styles.description} maxFontSizeMultiplier={2}>{description}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
