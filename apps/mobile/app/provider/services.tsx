import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
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
// A7 — shared UI kit for loading/empty states + toast feedback.
import { Button, SkeletonCard, EmptyState } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { formatPHP } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Wrench, X } from '@/components/icons';
import { useResponsive } from '@/hooks/useResponsive';

function servicePriceLabel(service: ProviderServiceItem): string {
  if (service.pricingType === 'hourly' && service.hourlyRate != null) {
    return `Customer price ${formatPHP(service.hourlyRate)}/hour`;
  }
  if (service.pricingType === 'per_unit' && service.unitPrice != null) {
    return `Customer price ${formatPHP(service.unitPrice)}/${service.unitLabel || 'unit'}`;
  }
  if (service.pricingType === 'range' && service.minPrice != null && service.maxPrice != null) {
    return `Customer range ${formatPHP(service.minPrice)}–${formatPHP(service.maxPrice)}`;
  }
  if (service.pricingType === 'quote') return 'Quote after assessment';
  if (service.basePrice != null) return `Customer price ${formatPHP(service.basePrice)}`;
  return 'Catalog price pending';
}

export default function ManageServicesScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isPhone } = useResponsive();

  const [showAdd, setShowAdd] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<Subcategory | null>(null);

  const servicesQuery = useQuery({
    queryKey: ['myServices'],
    queryFn: getMyServices,
    staleTime: 60 * 1000,
  });
  const { isError: servicesError, isRefetching: servicesRefetching } = servicesQuery;

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
    staleTime: 24 * 60 * 60 * 1000,
    enabled: showAdd || !isPhone,
  });
  const { isError: categoriesError } = categoriesQuery;

  const subcategoriesQuery = useQuery({
    queryKey: ['subcategories', selectedCategory?.slug],
    queryFn: () => getSubcategories(selectedCategory!.slug),
    enabled: !!selectedCategory?.slug,
    staleTime: 60 * 60 * 1000,
  });
  const { isError: subcategoriesError } = subcategoriesQuery;

  const addMutation = useMutation({
    mutationFn: () => {
      if (!selectedSubcategory) throw new Error('No subcategory selected');
      return addService(selectedSubcategory.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['myServices'] });
      void queryClient.invalidateQueries({ queryKey: ['providerProfile'] });
      setShowAdd(false);
      setSelectedCategory(null);
      setSelectedSubcategory(null);
      showToast('Service added to your profile.', 'success');
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      showToast(getErrorMessage(err, 'Failed to add service.'), 'error');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (subcategoryId: string) => removeService(subcategoryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['myServices'] });
      void queryClient.invalidateQueries({ queryKey: ['providerProfile'] });
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      showToast(getErrorMessage(err, 'Failed to remove service.'), 'error');
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
  const subcategories = subcategoriesQuery.data?.subcategories ?? [];
  const showAddWorkspace = showAdd || !isPhone;

  const clearAddForm = (): void => {
    setShowAdd(false);
    setSelectedCategory(null);
    setSelectedSubcategory(null);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Services</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={servicesRefetching} onRefresh={() => void servicesQuery.refetch()} tintColor={colors.secondary} />}
      >
        <View style={styles.contentColumn}>
        <View style={styles.pricingNotice}>
          <Text style={styles.pricingNoticeTitle}>Customer prices are set by the catalog</Text>
          <Text style={styles.pricingNoticeText}>
            You can add or remove services here. Personal price changes are paused while the platform completes its pricing-policy review, so customers always see the same price they are charged.
          </Text>
        </View>
        <View
          accessibilityLabel={!isPhone ? 'Tablet and desktop service management workspace' : undefined}
          style={[styles.servicesWorkspace, !isPhone && styles.servicesWorkspaceWide]}
        >
          <View accessibilityLabel="Services on your profile" style={styles.servicesPanel}>
            <View style={styles.panelHeading}>
              <Text style={styles.panelTitle}>Services on your profile</Text>
              <Text style={styles.serviceCount}>{services.length}</Text>
            </View>
            {servicesError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>Failed to load your services. Pull to refresh.</Text>
              </View>
            )}
            {servicesQuery.isLoading ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : services.length === 0 ? (
              // BUG-PHASE183-01 — empty state has an embedded "Add Your First
              // Service" CTA so a provider sees a clear next step.
              <EmptyState
                icon={<Wrench size={48} color={colors.textTertiary} />}
                title="No services added yet"
                description="Add services you can offer to customers."
                actionLabel={isPhone && !showAdd ? 'Add Your First Service' : undefined}
                onAction={isPhone && !showAdd ? () => setShowAdd(true) : undefined}
              />
            ) : (
              services.map((svc) => (
                <View key={svc.id}>
                  <View style={styles.serviceCard}>
                    <View style={styles.serviceInfo}>
                      <Text style={styles.serviceName}>{svc.subcategoryName}</Text>
                      <Text style={styles.servicePrice}>{servicePriceLabel(svc)}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => handleRemove(svc)}
                      disabled={removeMutation.isPending}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${svc.subcategoryName}`}
                    >
                      <X size={16} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}

            {!showAddWorkspace && (
              <Button
                title="+ Add Service"
                onPress={() => setShowAdd(true)}
                variant="outline"
                style={styles.addButton}
              />
            )}
          </View>

        {showAddWorkspace && (
          <View style={[styles.addForm, !isPhone && styles.addFormWide]}>
            <Text style={styles.addTitle}>Add a Service</Text>

            <Text style={styles.formLabel}>Category</Text>
            {categoriesError && (
              <View style={{ backgroundColor: colors.errorLight, padding: 12, borderRadius: 10, marginBottom: spacing.sm }}>
                <Text style={{ color: colors.error, fontSize: 13, textAlign: 'center' }}>Failed to load categories. Please try again.</Text>
              </View>
            )}
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
                {subcategoriesError && (
                  <View style={{ backgroundColor: colors.errorLight, padding: 12, borderRadius: 10, marginBottom: spacing.sm }}>
                    <Text style={{ color: colors.error, fontSize: 13, textAlign: 'center' }}>Failed to load subcategories. Please try again.</Text>
                  </View>
                )}
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

            <View style={styles.addActions}>
              <Button
                title={addMutation.isPending ? 'Adding...' : 'Add Service'}
                onPress={() => addMutation.mutate()}
                loading={addMutation.isPending}
                disabled={!selectedSubcategory || addMutation.isPending}
              />
              <Button
                title={isPhone ? 'Cancel' : 'Clear selection'}
                onPress={clearAddForm}
                variant="ghost"
              />
            </View>
          </View>
        )}
        </View>
        </View>
      </ScrollView>
    </View>
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
    borderBottomColor: colors.divider,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: 100 },
  contentColumn: { width: '100%', maxWidth: 920, alignSelf: 'center' },
  servicesWorkspace: { width: '100%' },
  servicesWorkspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  servicesPanel: { flex: 1, minWidth: 0 },
  panelHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  panelTitle: { ...typography.h3, color: colors.text },
  serviceCount: { ...typography.caption, color: colors.primary, backgroundColor: colors.primaryLight, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.full },
  errorBanner: { backgroundColor: colors.errorLight, padding: spacing.md, borderRadius: borderRadius.lg, marginBottom: spacing.md },
  errorBannerText: { ...typography.bodySmall, color: colors.error, textAlign: 'center' },
  pricingNotice: {
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  pricingNoticeTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  pricingNoticeText: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 20 },

  empty: { alignItems: 'center', paddingTop: spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.base },
  emptyIconWrap: { marginBottom: spacing.base, alignItems: 'center' as const },
  emptyText: { ...typography.body, color: colors.text, fontWeight: '600' },
  emptyHint: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  // BUG-PHASE183-01 fix styles for the inline "Add Your First Service" CTA.
  emptyCta: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    minHeight: 44,
    justifyContent: 'center' as const,
  },
  emptyCtaText: { color: colors.white, fontWeight: '600', fontSize: 14 },

  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  serviceInfo: { flex: 1 },
  serviceName: { ...typography.body, color: colors.text, fontWeight: '600' },
  servicePrice: { ...typography.bodySmall, color: colors.secondary, marginTop: 2 },
  removeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: colors.error, fontSize: 14, fontWeight: '700' },
  addButton: { marginTop: spacing.lg },

  addForm: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.base,
  },
  addFormWide: { flex: 1, minWidth: 0 },
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
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.secondary, borderColor: colors.secondary },
  chipText: { ...typography.bodySmall, color: colors.text },
  chipTextActive: { color: colors.white, fontWeight: '600' },

  addActions: { gap: spacing.sm, marginTop: spacing.lg },
});
