/**
 * Phase 14 Dispatch 11 — FilterModal
 *
 * Bottom-sheet style modal for multi-select filters (search, bookings).
 * Includes Pattern 13 hardware-back dismissal and Pattern 14 confirmation
 * flow (Apply / Reset / Cancel). Filter values stay local until Apply.
 */

import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  BackHandler,
  Platform,
} from 'react-native';
import { colors, spacing, borderRadius, typography } from '@/config/theme';

export interface FilterGroup {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  multi?: boolean;
}

export interface FilterModalProps {
  visible: boolean;
  title?: string;
  groups: FilterGroup[];
  initialValue: Record<string, string[]>;
  onApply: (selected: Record<string, string[]>) => void;
  onClose: () => void;
}

export function FilterModal({
  visible,
  title = 'Filters',
  groups,
  initialValue,
  onApply,
  onClose,
}: FilterModalProps): React.ReactElement {
  const [pending, setPending] = useState<Record<string, string[]>>(initialValue);

  useEffect(() => {
    if (visible) setPending(initialValue);
  }, [visible, initialValue]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  function toggle(groupKey: string, value: string, multi?: boolean): void {
    setPending((prev) => {
      const cur = prev[groupKey] ?? [];
      if (multi) {
        return {
          ...prev,
          [groupKey]: cur.includes(value)
            ? cur.filter((v) => v !== value)
            : [...cur, value],
        };
      }
      return { ...prev, [groupKey]: cur.includes(value) ? [] : [value] };
    });
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal accessibilityRole="menu">
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close filters"
              hitSlop={12}
            >
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            {groups.map((group) => (
              <View key={group.key} style={styles.group}>
                <Text style={styles.groupLabel}>{group.label}</Text>
                <View style={styles.optionsRow}>
                  {group.options.map((opt) => {
                    const active = (pending[group.key] ?? []).includes(opt.value);
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => toggle(group.key, opt.value, group.multi)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: active }}
                        style={[styles.option, active && styles.optionActive]}
                      >
                        <Text style={[styles.optionText, active && styles.optionTextActive]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.resetButton]}
              onPress={() => setPending({})}
              accessibilityRole="button"
              accessibilityLabel="Reset filters"
            >
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.applyButton]}
              onPress={() => onApply(pending)}
              accessibilityRole="button"
              accessibilityLabel="Apply filters"
            >
              <Text style={styles.applyText}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  title: { ...typography.h3, color: colors.text },
  closeText: { ...typography.body, color: colors.primary, fontWeight: '600' },
  body: { padding: spacing.lg, gap: spacing.lg },
  group: { gap: spacing.sm },
  groupLabel: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.divider,
  },
  optionActive: { backgroundColor: colors.primary },
  optionText: { ...typography.bodySmall, color: colors.text },
  optionTextActive: { color: colors.white, fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  resetButton: { backgroundColor: colors.divider },
  resetText: { ...typography.button, color: colors.text },
  applyButton: { backgroundColor: colors.primary },
  applyText: { ...typography.button, color: colors.white },
});

export default FilterModal;
