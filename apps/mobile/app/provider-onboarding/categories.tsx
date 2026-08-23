import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getCategories, type Category } from '@/services/catalog.service';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { Input, Button } from '@/components/ui';
import { colors, spacing, typography, borderRadius, getCategoryTint } from '@/config/theme';
import type { ComponentType } from 'react';
import { Sparkles, Wrench, Zap, Paintbrush2, Snowflake, Bug, Package, Hammer, Plug, AlertTriangle, Check } from '@/components/icons';

import { Routes } from '@/config/navigation';
type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

const CATEGORY_ICONS: Record<string, IconComponent> = {
  cleaning: Sparkles, plumbing: Wrench, electrical: Zap, painting: Paintbrush2,
  aircon: Snowflake, 'aircon-services': Snowflake, pest: Bug, 'pest-control': Bug,
  moving: Package, carpentry: Hammer, appliance: Plug, 'appliance-repair': Plug,
  'general-maintenance': Hammer,
};

export default function CategoriesScreen(): React.ReactElement {
  const router = useRouter();
  const { businessName, categoryIds, setBusinessName, setCategories } = useOnboardingStore();
  const [selected, setSelected] = useState<Set<string>>(new Set(categoryIds));
  const [name, setName] = useState(businessName);

  const { data: categories = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const toggleCategory = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 10) next.add(id);
      else Alert.alert('Limit', 'You can select up to 10 service categories.');
      return next;
    });
  };

  const handleNext = (): void => {
    if (name.trim().length < 2) {
      Alert.alert('Required', 'Enter your business or professional name (at least 2 characters).');
      return;
    }
    if (selected.size === 0) {
      Alert.alert('Required', 'Select at least one service category.');
      return;
    }
    setBusinessName(name.trim());
    setCategories([...selected]);
    router.push(Routes.PROVIDER_ONBOARDING.SERVICE_AREA);
  };

  const renderCategory = ({ item }: { item: Category }): React.ReactElement => {
    const isSelected = selected.has(item.id);
    const Icon = CATEGORY_ICONS[item.slug] ?? Hammer;
    const tint = getCategoryTint(item.slug);
    return (
      <TouchableOpacity
        style={[styles.catItem, isSelected && styles.catItemSelected]}
        onPress={() => toggleCategory(item.id)}
        activeOpacity={0.7}
      >
        <View style={[styles.catIconWrap, { backgroundColor: tint.bg }]}><Icon size={28} color={isSelected ? colors.primary : tint.fg} /></View>
        <Text style={[styles.catLabel, isSelected && styles.catLabelSelected]} numberOfLines={2}>
          {item.name}
        </Text>
        {isSelected && <Check style={styles.catCheck} size={16} color={colors.primary} />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.progress}>
          <View style={[styles.progressDot, styles.progressActive]} />
          <View style={styles.progressDot} />
          <View style={styles.progressDot} />
          <View style={styles.progressDot} />
          <View style={styles.progressDot} />
          <View style={styles.progressDot} />
        </View>
        <Text style={styles.step}>1 / 6</Text>
      </View>

      <Text style={styles.title}>Your Services</Text>
      <Text style={styles.subtitle}>Enter your business name and select the services you offer.</Text>

      {/* BUG-PHASE149-01 fix — pre-fix businessName input had no
          maxLength. Server's providerApplicationSchema caps at
          max(200) (provider.validators.ts:24). */}
      <View style={styles.nameInput}>
        <Input
          label="Business / Professional Name"
          placeholder="e.g. Juan's Plumbing"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          maxLength={200}
        />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isError ? (
        <View style={styles.loadingContainer}>
          <View style={{ marginBottom: 12, alignItems: 'center' }}><AlertTriangle size={48} color={colors.error} /></View>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 8 }}>Something went wrong</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 16 }}>Failed to load categories. Please try again.</Text>
          <TouchableOpacity onPress={() => void refetch()} style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: borderRadius.md }}>
            <Text style={{ color: colors.white, fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={categories}
          renderItem={renderCategory}
          keyExtractor={(item) => item.id}
          numColumns={3}
          columnWrapperStyle={styles.catRow}
          contentContainerStyle={styles.catList}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={styles.footer}>
        <Text style={styles.selectedCount}>{selected.size} selected</Text>
        <Button title="Next" onPress={handleNext} disabled={selected.size === 0 || name.trim().length < 2} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  progress: { flexDirection: 'row', flex: 1, justifyContent: 'center', gap: spacing.xs },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  progressActive: { backgroundColor: colors.primary, width: 24 },
  step: { ...typography.caption, color: colors.textTertiary, marginLeft: spacing.sm },
  title: { ...typography.h2, color: colors.text, paddingHorizontal: spacing.base, marginTop: spacing.base },
  subtitle: {
    ...typography.bodySmall, color: colors.textSecondary,
    paddingHorizontal: spacing.base, marginBottom: spacing.sm,
  },
  nameInput: { paddingHorizontal: spacing.base, marginBottom: spacing.sm },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  catList: { paddingHorizontal: spacing.base, paddingBottom: spacing.base },
  catRow: { gap: spacing.sm, marginBottom: spacing.sm },
  catItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    position: 'relative' as const,
  },
  catItemSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  catIcon: { fontSize: 28, marginBottom: spacing.xs },
  catIconWrap: {
    marginBottom: spacing.xs,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
  },
  catLabel: { ...typography.caption, color: colors.text, textAlign: 'center', fontWeight: '500' },
  catLabelSelected: { color: colors.primary, fontWeight: '700' },
  catCheck: {
    position: 'absolute' as const,
    top: 4,
    right: 6,
    fontSize: 12,
    color: colors.primary,
    fontWeight: '700' as const,
  },
  footer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  selectedCount: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
});
