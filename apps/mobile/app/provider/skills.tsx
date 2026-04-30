import React, { useMemo, useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '@/services/api';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { CheckCircle2, Search, ChevronRight } from '@/components/icons';

interface CategoryDef {
  id: string;
  name: string;
  subcategories: { id: string; name: string }[];
}

const CATEGORIES: CategoryDef[] = [
  {
    id: 'cleaning',
    name: 'Cleaning',
    subcategories: [
      { id: 'cleaning-general', name: 'General' },
      { id: 'cleaning-deep', name: 'Deep' },
      { id: 'cleaning-moveout', name: 'Move-out' },
      { id: 'cleaning-sofa', name: 'Sofa' },
      { id: 'cleaning-carpet', name: 'Carpet' },
      { id: 'cleaning-window', name: 'Window' },
    ],
  },
  {
    id: 'plumbing',
    name: 'Plumbing',
    subcategories: [
      { id: 'plumb-leak', name: 'Leak repair' },
      { id: 'plumb-clog', name: 'Drain unclog' },
      { id: 'plumb-install', name: 'Fixture install' },
      { id: 'plumb-water-heater', name: 'Water heater' },
      { id: 'plumb-pipe', name: 'Pipe replacement' },
    ],
  },
  {
    id: 'electrical',
    name: 'Electrical',
    subcategories: [
      { id: 'elec-outlets', name: 'Outlets & switches' },
      { id: 'elec-wiring', name: 'Wiring' },
      { id: 'elec-lighting', name: 'Lighting install' },
      { id: 'elec-panel', name: 'Panel work' },
      { id: 'elec-troubleshoot', name: 'Troubleshooting' },
    ],
  },
  {
    id: 'aircon',
    name: 'Aircon',
    subcategories: [
      { id: 'ac-cleaning', name: 'Cleaning' },
      { id: 'ac-install', name: 'Installation' },
      { id: 'ac-repair', name: 'Repair' },
      { id: 'ac-recharge', name: 'Refrigerant recharge' },
      { id: 'ac-dismantle', name: 'Dismantle / move' },
    ],
  },
  {
    id: 'gardening',
    name: 'Gardening',
    subcategories: [
      { id: 'garden-mow', name: 'Lawn mowing' },
      { id: 'garden-trim', name: 'Trimming' },
      { id: 'garden-plant', name: 'Planting' },
      { id: 'garden-cleanup', name: 'Yard cleanup' },
      { id: 'garden-landscape', name: 'Landscaping' },
    ],
  },
  {
    id: 'painting',
    name: 'Painting',
    subcategories: [
      { id: 'paint-interior', name: 'Interior' },
      { id: 'paint-exterior', name: 'Exterior' },
      { id: 'paint-touchup', name: 'Touch-up' },
      { id: 'paint-cabinet', name: 'Cabinets' },
      { id: 'paint-decorative', name: 'Decorative' },
    ],
  },
  {
    id: 'carpentry',
    name: 'Carpentry',
    subcategories: [
      { id: 'carp-furniture', name: 'Furniture assembly' },
      { id: 'carp-shelves', name: 'Shelving' },
      { id: 'carp-doors', name: 'Doors & frames' },
      { id: 'carp-flooring', name: 'Flooring' },
      { id: 'carp-custom', name: 'Custom builds' },
    ],
  },
  {
    id: 'appliance',
    name: 'Appliance Repair',
    subcategories: [
      { id: 'app-fridge', name: 'Refrigerator' },
      { id: 'app-washer', name: 'Washer / dryer' },
      { id: 'app-stove', name: 'Stove / oven' },
      { id: 'app-microwave', name: 'Microwave' },
      { id: 'app-dishwasher', name: 'Dishwasher' },
    ],
  },
  {
    id: 'pest',
    name: 'Pest Control',
    subcategories: [
      { id: 'pest-rodent', name: 'Rodents' },
      { id: 'pest-roach', name: 'Cockroaches' },
      { id: 'pest-termite', name: 'Termites' },
      { id: 'pest-mosquito', name: 'Mosquitoes' },
      { id: 'pest-bedbug', name: 'Bed bugs' },
    ],
  },
  {
    id: 'moving',
    name: 'Moving',
    subcategories: [
      { id: 'move-local', name: 'Local move' },
      { id: 'move-packing', name: 'Packing' },
      { id: 'move-loading', name: 'Loading help' },
      { id: 'move-storage', name: 'Storage' },
      { id: 'move-furniture', name: 'Furniture only' },
    ],
  },
  {
    id: 'tutoring',
    name: 'Tutoring',
    subcategories: [
      { id: 'tutor-math', name: 'Math' },
      { id: 'tutor-science', name: 'Science' },
      { id: 'tutor-english', name: 'English' },
      { id: 'tutor-language', name: 'Language' },
      { id: 'tutor-music', name: 'Music' },
    ],
  },
  {
    id: 'massage',
    name: 'Massage',
    subcategories: [
      { id: 'mass-swedish', name: 'Swedish' },
      { id: 'mass-deep', name: 'Deep tissue' },
      { id: 'mass-shiatsu', name: 'Shiatsu' },
      { id: 'mass-sports', name: 'Sports' },
      { id: 'mass-prenatal', name: 'Prenatal' },
    ],
  },
];

interface SelectionState {
  enabled: boolean;
  subs: Record<string, boolean>;
}

function emptySelection(): SelectionState {
  return { enabled: false, subs: {} };
}

export default function ProviderSkillsScreen(): React.ReactElement {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<Record<string, SelectionState>>(() => {
    const init: Record<string, SelectionState> = {};
    CATEGORIES.forEach((c) => {
      init[c.id] = emptySelection();
    });
    return init;
  });
  const [saving, setSaving] = useState(false);

  const visibleCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return CATEGORIES;
    return CATEGORIES.filter((c) => c.name.toLowerCase().includes(q));
  }, [query]);

  const toggleCategory = (categoryId: string, on: boolean): void => {
    setSelection((prev) => ({
      ...prev,
      [categoryId]: { ...(prev[categoryId] ?? emptySelection()), enabled: on },
    }));
  };

  const toggleSub = (categoryId: string, subId: string): void => {
    setSelection((prev) => {
      const cur = prev[categoryId] ?? emptySelection();
      const subs = { ...cur.subs, [subId]: !cur.subs[subId] };
      return { ...prev, [categoryId]: { ...cur, subs } };
    });
  };

  const handleSave = async (): Promise<void> => {
    const payload = {
      categories: CATEGORIES.filter((c) => selection[c.id]?.enabled).map((c) => ({
        categoryId: c.id,
        subCategoryIds: c.subcategories
          .filter((s) => selection[c.id]?.subs[s.id])
          .map((s) => s.id),
      })),
    };
    setSaving(true);
    try {
      await api.post('/api/v1/providers/me/skills', payload);
      Alert.alert('Saved', 'Your skills have been updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      Alert.alert(
        'Save failed',
        axErr?.response?.data?.error?.message ?? 'Could not update skills. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const renderCategory = ({ item }: { item: CategoryDef }): React.ReactElement => {
    const state = selection[item.id] ?? emptySelection();
    return (
      <View style={styles.categoryCard}>
        <View style={styles.categoryRow}>
          <View style={styles.categoryInfo}>
            <Text style={styles.categoryName}>{item.name}</Text>
            <Text style={styles.categoryHint}>I offer this</Text>
          </View>
          <Switch
            value={state.enabled}
            onValueChange={(v) => toggleCategory(item.id, v)}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.white}
          />
        </View>
        {state.enabled && (
          <View style={styles.subPanel}>
            {item.subcategories.map((sub) => {
              const checked = !!state.subs[sub.id];
              return (
                <TouchableOpacity
                  key={sub.id}
                  style={styles.subRow}
                  onPress={() => toggleSub(item.id, sub.id)}
                  activeOpacity={0.7}
                >
                  {checked ? (
                    <CheckCircle2 size={20} color={colors.success} />
                  ) : (
                    <View style={styles.subUncheckedCircle} />
                  )}
                  <Text style={[styles.subLabel, checked && styles.subLabelChecked]}>
                    {sub.name}
                  </Text>
                  <ChevronRight size={14} color={colors.textTertiary} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Skills</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.searchWrap}>
        <Search size={16} color={colors.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search categories"
          placeholderTextColor={colors.textTertiary}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <FlatList
        data={visibleCategories}
        keyExtractor={(c) => c.id}
        renderItem={renderCategory}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No categories match your search.</Text>
        }
      />

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]}
          onPress={() => { void handleSave(); }}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.primaryBtnText}>Save Skills</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 44 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    margin: spacing.base,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    ...typography.body,
    paddingVertical: 0,
  },
  listContent: { paddingHorizontal: spacing.base, paddingBottom: 120 },
  categoryCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  categoryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryInfo: { flex: 1 },
  categoryName: { ...typography.body, color: colors.text, fontWeight: '600' },
  categoryHint: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  subPanel: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.xs,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  subUncheckedCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
  },
  subLabel: { ...typography.body, color: colors.text, flex: 1 },
  subLabelChecked: { color: colors.text, fontWeight: '600' },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  footer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.base,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { ...typography.button, color: colors.white },
});
