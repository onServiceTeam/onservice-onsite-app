import React from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@/config/theme';
import { useResponsive, byBreakpoint } from '@/hooks/useResponsive';

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
}: ScreenContainerProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { breakpoint } = useResponsive();
  const horizontalPadding = byBreakpoint(breakpoint, {
    phone: spacing.base,
    tablet: spacing.lg,
    desktop: spacing.xl,
  });

  if (scrollable) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor }]}
        contentContainerStyle={[
          padded && { paddingHorizontal: horizontalPadding },
          { paddingTop: insets.top, paddingBottom: insets.bottom + 80 },
          style,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
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
        padded && { paddingHorizontal: horizontalPadding },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
