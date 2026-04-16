import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { useBookingStore, type SelectedAddon } from '@/stores/booking.store';
import { Button } from '@/components/ui';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';

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
  const { draft, setAddons } = useBookingStore();

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

  const selectedAddons = Array.from(selected.values());
  const addonsSum = selectedAddons.reduce((s, a) => s + a.price, 0);
  const subtotal = draft.basePrice + addonsSum;
  const localFee = Math.max(
    platformConfig.minimumServiceFee,
    Math.min(platformConfig.maximumServiceFee, Math.round(subtotal * platformConfig.serviceFeeRate)),
  );

  const handleContinue = useCallback(() => {
    setAddons(selectedAddons);
    router.push('/customer/booking/form');
  }, [selectedAddons, setAddons, router]);

  const handleSkip = useCallback(() => {
    setAddons([]);
    router.push('/customer/booking/form');
  }, [setAddons, router]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Customize Your Service</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.serviceInfo}>
          <Text style={styles.serviceName}>{draft.subcategoryName ?? 'Service'}</Text>
          <Text style={styles.servicePrice}>{formatPHP(draft.basePrice)}</Text>
        </View>

        {isLoading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
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
            <Text style={styles.sectionTitle}>Available Add-ons</Text>
            <Text style={styles.sectionDesc}>Select any extras you need</Text>

            {addons.map((addon) => {
              const isSelected = selected.has(addon.id);
              return (
                <TouchableOpacity
                  key={addon.id}
                  style={[styles.addonCard, isSelected && styles.addonCardActive]}
                  onPress={() => toggleAddon(addon)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                    {isSelected && <Text style={styles.checkMark}>✓</Text>}
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

        {selectedAddons.length > 0 && (
          <View style={styles.breakdown}>
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
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.base }]}>
        {addons && addons.length > 0 ? (
          <Button
            title={selectedAddons.length > 0
              ? `Continue with ${selectedAddons.length} add-on${selectedAddons.length > 1 ? 's' : ''} • ${formatPHP(subtotal)}`
              : 'Continue without add-ons'}
            onPress={handleContinue}
          />
        ) : (
          <Button title="Continue" onPress={handleSkip} />
        )}
      </View>
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
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: 120 },

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

  breakdown: {
    backgroundColor: colors.backgroundSecondary,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
  },
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
  },
});
