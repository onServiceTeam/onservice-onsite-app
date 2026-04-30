/**
 * Phase 14 Dispatch 11 — PaginationLoader
 *
 * Footer component for paginated lists (bookings, services, search results).
 * Shows a small spinner while loading the next page; collapses when no more
 * results are available. Pattern 8 in Part 2B (loading skeletons), but as
 * a list-footer affordance instead of a full-screen replacement.
 */

import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '@/config/theme';

export interface PaginationLoaderProps {
  loading: boolean;
  hasMore: boolean;
  endLabel?: string;
}

export function PaginationLoader({
  loading,
  hasMore,
  endLabel = "You're all caught up",
}: PaginationLoaderProps): React.ReactElement | null {
  if (loading) {
    return (
      <View style={styles.container} accessibilityLabel="Loading more">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!hasMore) {
    return (
      <View style={styles.container}>
        <Text style={styles.endLabel}>{endLabel}</Text>
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  endLabel: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
});

export default PaginationLoader;
