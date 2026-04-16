import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMyServices,
  addService,
  removeService,
  type ProviderServiceItem,
} from '@/services/provider-api.service';
import { getCategories, getSubcategories, type Category, type Subcategory } from '@/services/catalog.service';
import { Button, Input } from '@/components/ui';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

export default function ManageServicesScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [showAdd, setShowAdd] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<Subcategory | null>(null);
  const [basePrice, setBasePrice] = useState('');

  const servicesQuery = useQuery({
    queryKey: ['myServices'],
    queryFn: getMyServices,
    staleTime: 60 * 1000,
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
    staleTime: 24 * 60 * 60 * 1000,
    enabled: showAdd,
  });

  const subcategoriesQuery = useQuery({
    queryKey: ['subcategories', selectedCategory?.slug],
    queryFn: () => getSubcategories(selectedCategory!.slug),
    enabled: !!selectedCategory?.slug,
    staleTime: 60 * 60 * 1000,
  });

  const addMutation = useMutation({
    mutationFn: () => {
      if (!selectedSubcategory) throw new Error('No subcategory selected');
      const rawPrice = parseFloat(basePrice || '0');
      const price = rawPrice > 0 ? Math.round(rawPrice * 100) : undefined;
      return addService(selectedSubcategory.id, price);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['myServices'] });
      void queryClient.invalidateQueries({ queryKey: ['providerProfile'] });
      setShowAdd(false);
      setSelectedCategory(null);
      setSelectedSubcategory(null);
      setBasePrice('');
      Alert.alert('Added', 'Service has been added to your profile.');
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      Alert.alert('Error', axErr?.response?.data?.error?.message ?? 'Failed to add service.');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (subcategoryId: string) => removeService(subcategoryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['myServices'] });
      void queryClient.invalidateQueries({ queryKey: ['providerProfile'] });
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      Alert.alert('Error', axErr?.response?.data?.error?.message ?? 'Failed to remove service.');
    },
  });

  const handleRemove = (svc: ProviderServiceItem): void => {
    Alert.alert('Remove Service', `Remove "${svc.subcategoryName}" from your profile?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeMutation.mutate(svc.subcategoryId) },
    ]);
  };

  const services = servicesQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const subcategories = subcategoriesQuery.data ?? [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Services</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {servicesQuery.isLoading ? (
          <ActivityIndicator size="large" color={colors.secondary} style={{ marginTop: spacing.xl }} />
        ) : services.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🛠</Text>
            <Text style={styles.emptyText}>No services added yet</Text>
            <Text style={styles.emptyHint}>Add services you can offer to customers</Text>
          </View>
        ) : (
          services.map((svc) => (
            <View key={svc.id} style={styles.serviceCard}>
              <View style={styles.serviceInfo}>
                <Text style={styles.serviceName}>{svc.subcategoryName}</Text>
                {svc.basePrice != null && (
                  <Text style={styles.servicePrice}>Starting at {formatPHP(svc.basePrice)}</Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => handleRemove(svc)}
                disabled={removeMutation.isPending}
              >
                <Text style={styles.removeText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        {!showAdd ? (
          <Button
            title="+ Add Service"
            onPress={() => setShowAdd(true)}
            variant="outline"
            style={styles.addButton}
          />
        ) : (
          <View style={styles.addForm}>
            <Text style={styles.addTitle}>Add a Service</Text>

            <Text style={styles.formLabel}>Category</Text>
            <View style={styles.chipGrid}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.chip, selectedCategory?.id === cat.id && styles.chipActive]}
                  onPress={() => {
                    setSelectedCategory(cat);
                    setSelectedSubcategory(null);
                  }}
                >
                  <Text style={[styles.chipText, selectedCategory?.id === cat.id && styles.chipTextActive]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {selectedCategory && (
              <>
                <Text style={styles.formLabel}>Subcategory</Text>
                {subcategoriesQuery.isLoading ? (
                  <ActivityIndicator color={colors.secondary} style={{ marginVertical: spacing.md }} />
                ) : (
                  <View style={styles.chipGrid}>
                    {subcategories.map((sub) => (
                      <TouchableOpacity
                        key={sub.id}
                        style={[styles.chip, selectedSubcategory?.id === sub.id && styles.chipActive]}
                        onPress={() => setSelectedSubcategory(sub)}
                      >
                        <Text style={[styles.chipText, selectedSubcategory?.id === sub.id && styles.chipTextActive]}>
                          {sub.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}

            {selectedSubcategory && (
              <Input
                label="Your Base Price (₱)"
                placeholder="e.g. 500"
                value={basePrice}
                onChangeText={setBasePrice}
                keyboardType="decimal-pad"
              />
            )}

            <View style={styles.addActions}>
              <Button
                title={addMutation.isPending ? 'Adding...' : 'Add Service'}
                onPress={() => addMutation.mutate()}
                loading={addMutation.isPending}
                disabled={!selectedSubcategory || addMutation.isPending}
              />
              <Button
                title="Cancel"
                onPress={() => {
                  setShowAdd(false);
                  setSelectedCategory(null);
                  setSelectedSubcategory(null);
                  setBasePrice('');
                }}
                variant="ghost"
              />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: 100 },

  empty: { alignItems: 'center', paddingTop: spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.base },
  emptyText: { ...typography.body, color: colors.text, fontWeight: '600' },
  emptyHint: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },

  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  serviceInfo: { flex: 1 },
  serviceName: { ...typography.body, color: colors.text, fontWeight: '600' },
  servicePrice: { ...typography.bodySmall, color: colors.secondary, marginTop: 2 },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: colors.error, fontSize: 14, fontWeight: '700' },

  addButton: { marginTop: spacing.lg },

  addForm: {
    marginTop: spacing.lg,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  addTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },
  formLabel: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    fontWeight: '600',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
    textTransform: 'uppercase',
  },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.secondary, borderColor: colors.secondary },
  chipText: { ...typography.bodySmall, color: colors.text },
  chipTextActive: { color: colors.white, fontWeight: '600' },

  addActions: { gap: spacing.sm, marginTop: spacing.lg },
});
