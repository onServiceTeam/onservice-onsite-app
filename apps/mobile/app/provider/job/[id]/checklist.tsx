import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPublicItem, setPublicItem } from '@/services/secure-storage.service';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

const DEFAULT_TEMPLATES: Record<string, string[]> = {
  cleaning: ['Arrive and assess area', 'Gather cleaning supplies', 'Clean surfaces and floors', 'Vacuum/mop', 'Sanitize bathrooms', 'Take completion photos', 'Final walkthrough with customer'],
  plumbing: ['Inspect the issue', 'Turn off water supply', 'Prepare tools and parts', 'Perform repair', 'Test for leaks', 'Clean up work area', 'Take before/after photos'],
  electrical: ['Inspect electrical panel', 'Check existing wiring', 'Turn off power at breaker', 'Perform work', 'Test connections', 'Restore power and verify', 'Take completion photos'],
  general: ['Arrive and greet customer', 'Assess the job scope', 'Prepare tools and materials', 'Perform the service', 'Clean up work area', 'Take completion photos', 'Get customer acknowledgment'],
};

function getStorageKey(bookingId: string): string {
  return `checklist_${bookingId}`;
}

export default function JobChecklistScreen(): React.ReactElement | null {
  const { id: bookingId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const [loaded, setLoaded] = useState(false);

  const loadChecklist = useCallback(() => {
    try {
      const stored = getPublicItem(getStorageKey(bookingId ?? ''));
      if (stored) {
        setItems(JSON.parse(stored));
      } else {
        const template = DEFAULT_TEMPLATES.general ?? [];
        const initial: ChecklistItem[] = template.map((text, i) => ({
          id: `item_${i}`,
          text,
          completed: false,
        }));
        setItems(initial);
      }
    } catch {
      setItems([]);
    }
    setLoaded(true);
  }, [bookingId]);

  useEffect(() => {
    if (!bookingId) return;
    loadChecklist();
  }, [bookingId, loadChecklist]);

  const saveChecklist = useCallback((updated: ChecklistItem[]) => {
    try {
      setPublicItem(getStorageKey(bookingId ?? ''), JSON.stringify(updated));
    } catch { /* non-critical */ }
  }, [bookingId]);

  const toggleItem = useCallback((id: string) => {
    setItems((prev) => {
      const updated = prev.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item,
      );
      saveChecklist(updated);
      return updated;
    });
  }, [saveChecklist]);

  const addItem = useCallback(() => {
    if (!newItemText.trim()) return;
    const newItem: ChecklistItem = {
      id: `item_${Date.now()}`,
      text: newItemText.trim(),
      completed: false,
    };
    setItems((prev) => {
      const updated = [...prev, newItem];
      saveChecklist(updated);
      return updated;
    });
    setNewItemText('');
  }, [newItemText, saveChecklist]);

  const removeItem = useCallback((id: string) => {
    Alert.alert('Remove Item', 'Remove this checklist item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setItems((prev) => {
            const updated = prev.filter((item) => item.id !== id);
            saveChecklist(updated);
            return updated;
          });
        },
      },
    ]);
  }, [saveChecklist]);

  const loadTemplate = useCallback((key: string) => {
    const template = DEFAULT_TEMPLATES[key] ?? DEFAULT_TEMPLATES.general;
    const initial: ChecklistItem[] = template!.map((text, i) => ({
      id: `tmpl_${i}_${Date.now()}`,
      text,
      completed: false,
    }));
    setItems(initial);
    saveChecklist(initial);
  }, [saveChecklist]);

  const completedCount = items.filter((i) => i.completed).length;
  const progress = items.length > 0 ? completedCount / items.length : 0;

  if (!loaded) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Job Checklist</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Progress</Text>
            <Text style={styles.progressCount}>{completedCount}/{items.length}</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          {progress === 1 && items.length > 0 && (
            <Text style={styles.completeMsg}>All tasks complete!</Text>
          )}
        </View>

        <View style={styles.templateRow}>
          <Text style={styles.templateLabel}>Templates:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {Object.keys(DEFAULT_TEMPLATES).map((key) => (
              <TouchableOpacity
                key={key}
                style={styles.templateChip}
                onPress={() => loadTemplate(key)}
              >
                <Text style={styles.templateChipText}>
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.checkItem, item.completed && styles.checkItemCompleted]}
            onPress={() => toggleItem(item.id)}
            onLongPress={() => removeItem(item.id)}
          >
            <View style={[styles.checkbox, item.completed && styles.checkboxChecked]}>
              {item.completed && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={[styles.checkText, item.completed && styles.checkTextCompleted]}>
              {item.text}
            </Text>
          </TouchableOpacity>
        ))}

        <View style={styles.addRow}>
          <TextInput
            style={styles.addInput}
            placeholder="Add a task..."
            placeholderTextColor={colors.textTertiary}
            value={newItemText}
            onChangeText={setNewItemText}
            onSubmitEditing={addItem}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[styles.addBtn, !newItemText.trim() && styles.addBtnDisabled]}
            onPress={addItem}
            disabled={!newItemText.trim()}
          >
            <Text style={styles.addBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>Long press an item to remove it.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },

  progressCard: {
    backgroundColor: colors.backgroundSecondary, borderRadius: borderRadius.lg,
    padding: spacing.base, marginBottom: spacing.base,
    borderWidth: 1, borderColor: colors.border,
  },
  progressHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.sm,
  },
  progressLabel: { ...typography.body, fontWeight: '600', color: colors.text },
  progressCount: { ...typography.body, fontWeight: '700', color: colors.primary },
  progressBarBg: {
    height: 8, backgroundColor: colors.divider, borderRadius: 4, overflow: 'hidden',
  },
  progressBarFill: {
    height: 8, backgroundColor: colors.success, borderRadius: 4,
  },
  completeMsg: {
    ...typography.caption, color: colors.success, fontWeight: '600',
    marginTop: spacing.sm, textAlign: 'center',
  },

  templateRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: spacing.base, gap: spacing.sm,
  },
  templateLabel: { ...typography.caption, color: colors.textSecondary },
  templateChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full, backgroundColor: colors.primaryLight,
    marginRight: spacing.xs,
  },
  templateChipText: { ...typography.caption, color: colors.primary, fontWeight: '600' },

  checkItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md,
    paddingHorizontal: spacing.base, borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundSecondary, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  checkItemCompleted: { backgroundColor: colors.successLight, borderColor: colors.success },
  checkbox: {
    width: 24, height: 24, borderRadius: borderRadius.sm, borderWidth: 2,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.md,
  },
  checkboxChecked: { backgroundColor: colors.success, borderColor: colors.success },
  checkmark: { color: colors.white, fontSize: 14, fontWeight: '700' },
  checkText: { ...typography.body, color: colors.text, flex: 1 },
  checkTextCompleted: { textDecorationLine: 'line-through', color: colors.textTertiary },

  addRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm,
  },
  addInput: {
    flex: 1, backgroundColor: colors.backgroundSecondary, borderRadius: borderRadius.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.base,
    borderWidth: 1, borderColor: colors.border, ...typography.body, color: colors.text,
  },
  addBtn: {
    width: 44, height: 44, borderRadius: borderRadius.md,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { fontSize: 24, fontWeight: '700', color: colors.white },

  hint: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.md },
});
