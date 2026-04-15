import React from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@/config/theme';

interface ScreenContainerProps {
  children: React.ReactNode;
  scrollable?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  padded?: boolean;
  style?: ViewStyle;
  backgroundColor?: string;
}

export default function ScreenContainer({
  children,
  scrollable = false,
  refreshing = false,
  onRefresh,
  padded = true,
  style,
  backgroundColor = colors.background,
}: ScreenContainerProps) {
  const insets = useSafeAreaInsets();

  if (scrollable) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor }]}
        contentContainerStyle={[
          padded && styles.padded,
          { paddingTop: insets.top, paddingBottom: insets.bottom + 80 },
          style,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor, paddingTop: insets.top, paddingBottom: insets.bottom },
        padded && styles.padded,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  padded: { paddingHorizontal: spacing.base },
});
