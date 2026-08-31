import React, { useState, useCallback } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { useBookingStore, type SelectedAddon } from '@/stores/booking.store';
import { Button, SkeletonCard, Card, SectionHeader, EmptyState } from '@/components/ui';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, typography, borderRadius, getCategoryTint } from '@/config/theme';
import { ChevronLeft, Check } from '@/components/icons';
import { platformConfig } from '@/config/platform.config';
import { useResponsive } from '@/hooks/useResponsive';
import ServiceScopeNotice from '@/components/ServiceScopeNotice';

import { Routes } from '@/config/navigation';
interface Addon {
  id: string;
  subcategoryId: string;
  name: string;
  description: string;
  price: number;
  displayOrder: number;
}

export default function ConfigureScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { draft, setAddons, setEstimatedHours } = useBookingStore();
  const { isPhone } = useResponsive();

  const [selected, setSelected] = useState<Map<string, SelectedAddon>>(
    new Map(draft.addons.map((a) => [a.id, a])),
  );

  const { data: addons, isLoading, isError: addonsError } = useQuery({
    queryKey: ['addons', draft.subcategoryId],
    queryFn: async () => {
      if (!draft.subcategoryId) return [];
      const res = await api.get<{ success: boolean; data: Addon[] }>(
        `/api/v1/catalog/subcategory/${draft.subcategoryId}/addons`,
      );
      return res.data.data;
    },
    enabled: !!draft.subcategoryId,
  });

  const toggleAddon = useCallback((addon: Addon) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(addon.id)) {
        next.delete(addon.id);
      } else {
        next.set(addon.id, { id: addon.id, name: addon.name, price: addon.price });
      }
      return next;
    });
  }, []);

  const tint = getCategoryTint(draft.categorySlug);

  const selectedAddons = Array.from(selected.values());
  const addonsSum = selectedAddons.reduce((s, a) => s + a.price, 0);
  const subtotal = draft.basePrice + addonsSum;
  const localFee = Math.max(
    platformConfig.minimumServiceFee,
    Math.min(platformConfig.maximumServiceFee, Math.round(subtotal * platformConfig.serviceFeeRate)),
  );

  const handleContinue = useCallback(() => {
    setAddons(selectedAddons);
    router.push(Routes.CUSTOMER.BOOKING_FORM);
  }, [selectedAddons, setAddons, router]);

  const handleSkip = useCallback(() => {
    setAddons([]);
    router.push(Routes.CUSTOMER.BOOKING_FORM);
  }, [setAddons, router]);

  if (!draft.categoryId || !draft.subcategoryId || !draft.categoryName || !draft.subcategoryName) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back from service customization">
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Customize Your Service</Text>
        </View>
        <EmptyState
          title="Choose a service first"
          description="This booking setup is missing its service selection. Browse services again so prices and scope come from the live catalog."
          actionLabel="Browse services"
          onAction={() => router.replace(Routes.TABS.HOME)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back from service customization">
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Customize Your Service</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[styles.formContent, !isPhone && styles.formContentWide]}
          accessibilityLabel={isPhone ? 'Service customization form' : 'Wide service customization workspace'}
        >
        <View style={[styles.configureWorkspace, !isPhone && styles.configureWorkspaceWide]}>
        <View style={[styles.configureColumn, !isPhone && styles.configurePrimaryWide]}>
        <View style={[styles.serviceInfo, { backgroundColor: tint.bg }]}>
          <Text style={[styles.serviceName, { color: tint.fg }]}>{draft.subcategoryName ?? 'Service'}</Text>
          <Text style={[styles.servicePrice, { color: tint.fg }]}>{formatPHP(draft.basePrice)}</Text>
          {draft.isHourly ? (
            <Text style={[styles.hourlyRateNote, { color: tint.fg }]}>{formatPHP(draft.hourlyRate)}/hr</Text>
          ) : null}
        </View>

        <ServiceScopeNotice
          description={draft.serviceDescription}
          pricingType={draft.pricingType}
        />

        {/* D27 Phase 4b — hourly estimate stepper. The amount above is the
            authorization (estimate x rate); the customer is billed for actual
            time and refunded the rest. */}
        {draft.isHourly && (
          <View style={styles.hourlyBox}>
            <Text style={styles.hourlyTitle}>How many hours do you estimate?</Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setEstimatedHours(Math.max(1, draft.estimatedHours - 0.5))}
                disabled={draft.estimatedHours <= 1}
                accessibilityRole="button"
                accessibilityLabel="Decrease estimated hours"
                accessibilityState={{ disabled: draft.estimatedHours <= 1 }}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepValue}>{draft.estimatedHours} hr{draft.estimatedHours !== 1 ? 's' : ''}</Text>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setEstimatedHours(draft.estimatedHours + 0.5)}
                accessibilityRole="button"
                accessibilityLabel="Increase estimated hours"
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.hourlyHelp}>
              You authorize up to {formatPHP(draft.basePrice)}. You're only charged for the actual time worked
              (capped at your estimate) — the rest is refunded to your wallet.
            </Text>
          </View>
        )}

        {isLoading && (
          <View style={styles.loadingBox}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        )}

        {addonsError && (
          <View style={{ backgroundColor: colors.errorLight, padding: 12, borderRadius: 10, marginBottom: 12 }}>
            <Text style={{ color: colors.error, fontSize: 13, textAlign: 'center' }}>Failed to load add-ons. You can continue without them.</Text>
          </View>
        )}

        {!isLoading && !addonsError && (!addons || addons.length === 0) && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No add-ons available for this service.</Text>
          </View>
        )}

        {addons && addons.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Available Add-ons" />
            <Text style={styles.sectionDesc}>Select any extras you need</Text>

            {addons.map((addon) => {
              const isSelected = selected.has(addon.id);
              return (
                <TouchableOpacity
                  key={addon.id}
                  style={[styles.addonCard, isSelected && styles.addonCardActive]}
                  onPress={() => toggleAddon(addon)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={`${addon.name}, add ${formatPHP(addon.price)}`}
                >
                  <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                    {isSelected && <Check size={16} color={colors.primary} />}
                  </View>
                  <View style={styles.addonInfo}>
                    <Text style={[styles.addonName, isSelected && styles.addonNameActive]}>
                      {addon.name}
                    </Text>
                    {addon.description ? (
                      <Text style={styles.addonDesc}>{addon.description}</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.addonPrice, isSelected && styles.addonPriceActive]}>
                    +{formatPHP(addon.price)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        </View>

        <View style={[styles.configureColumn, !isPhone && styles.configureSummaryWide]} accessibilityLabel="Service price summary">
          <Card style={styles.breakdown}>
            <Text style={styles.breakdownTitle}>Price Summary</Text>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Base Service</Text>
              <Text style={styles.breakdownValue}>{formatPHP(draft.basePrice)}</Text>
            </View>
            {selectedAddons.map((a) => (
              <View key={a.id} style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>{a.name}</Text>
                <Text style={styles.breakdownValue}>+{formatPHP(a.price)}</Text>
              </View>
            ))}
            <View style={styles.breakdownDivider} />
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Service Fee</Text>
              <Text style={styles.breakdownValue}>{formatPHP(localFee)}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.totalLabel}>Estimated Total</Text>
              <Text style={styles.totalValue}>{formatPHP(subtotal + localFee)}</Text>
            </View>
          </Card>
          <Text style={styles.summaryHint}>
            The final checkout shows the service, add-ons, fee, schedule, and payment method before you submit.
          </Text>
        </View>
        </View>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.base }]}>
        <View style={[styles.bottomBarContent, !isPhone && styles.formContentWide]}>
        {addons && addons.length > 0 ? (
          <Button
            title={selectedAddons.length > 0
              ? `Continue with ${selectedAddons.length} add-on${selectedAddons.length > 1 ? 's' : ''} • ${formatPHP(subtotal + localFee)}`
              : 'Continue without add-ons'}
            onPress={handleContinue}
          />
        ) : (
          <Button title="Continue" onPress={handleSkip} />
        )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  hourlyRateNote: { fontSize: 13, fontWeight: '600', marginTop: 2, opacity: 0.85 },
  hourlyBox: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, marginBottom: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  hourlyTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  stepBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 24, color: colors.text, fontWeight: '700', lineHeight: 26 },
  stepValue: { fontSize: 20, fontWeight: '800', color: colors.text, minWidth: 90, textAlign: 'center' },
  hourlyHelp: { fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginTop: spacing.md },
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
  scrollContent: { padding: spacing.base, paddingBottom: 120 },
  formContent: { width: '100%' },
  formContentWide: { maxWidth: 1180, alignSelf: 'center' },
  configureWorkspace: { width: '100%' },
  configureWorkspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl },
  configureColumn: { width: '100%' },
  configurePrimaryWide: { flex: 1, minWidth: 0 },
  configureSummaryWide: { width: 360 },

  serviceInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  serviceName: { ...typography.h3, color: colors.primary, flex: 1 },
  servicePrice: { ...typography.price, color: colors.primary },

  loadingBox: { paddingVertical: spacing.xxl, alignItems: 'center' },
  emptyBox: { paddingVertical: spacing.xl, alignItems: 'center' },
  emptyText: { ...typography.body, color: colors.textSecondary },

  section: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  sectionDesc: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md },

  addonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  addonCardActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  checkMark: { color: colors.white, fontSize: 14, fontWeight: '700' },
  addonInfo: { flex: 1 },
  addonName: { ...typography.body, fontWeight: '600', color: colors.text },
  addonNameActive: { color: colors.primary },
  addonDesc: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  addonPrice: { ...typography.body, fontWeight: '700', color: colors.textSecondary },
  addonPriceActive: { color: colors.primary },

  breakdown: {},
  summaryHint: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.md },
  breakdownTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  breakdownLabel: { ...typography.body, color: colors.textSecondary },
  breakdownValue: { ...typography.body, color: colors.text, fontWeight: '500' },
  breakdownDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  totalLabel: { ...typography.h3, color: colors.text },
  totalValue: { ...typography.price, color: colors.primary },

  bottomBar: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    alignItems: 'center',
  },
  bottomBarContent: { width: '100%' },
});
