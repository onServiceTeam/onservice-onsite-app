/**
 * Phase 14 Dispatch 11 — FilterChips
 *
 * Horizontal scrollable filter row used on services search, bookings
 * history, and category browse screens. Companion of FilterModal for
 * advanced filters; chips handle the common single-select toggles.
 */

import React from 'react';
import {
  ScrollView,
  Pressable,
  Text,
  StyleSheet,
  View,
} from 'react-native';
import { colors, spacing, borderRadius, typography } from '@/config/theme';

export interface FilterChipOption {
  value: string;
  label: string;
}

export interface FilterChipsProps {
  options: FilterChipOption[];
  selected: string;
  onSelect: (value: string) => void;
  testID?: string;
}

export function FilterChips({
  options,
  selected,
  onSelect,
  testID,
}: FilterChipsProps): React.ReactElement {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
      testID={testID}
      accessibilityRole="tablist"
    >
      {options.map((opt) => {
        const active = opt.value === selected;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onSelect(opt.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
      <View style={{ width: spacing.base }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // flexGrow:0 keeps the horizontal scroller from expanding to fill its parent
  // column on web (react-native-web would otherwise stretch it vertically,
  // which combined with the row's default align-items:stretch turned the chips
  // into tall full-height pills). alignSelf flex-start pins it to the top.
  scroll: { flexGrow: 0, flexShrink: 0, alignSelf: 'stretch' },
  row: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    // Chips size to their content and stay vertically centered instead of
    // stretching to the row height.
    alignItems: 'center',
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.divider,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: { ...typography.bodySmall, color: colors.text, fontWeight: '500' },
  chipTextActive: { color: colors.white, fontWeight: '600' },
});

export default FilterChips;
