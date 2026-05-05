import React, { useCallback } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getSubcategories, type Subcategory } from '@/services/catalog.service';
import { useBookingStore } from '@/stores/booking.store';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

import { Routes } from '@/config/navigation';
export default function SubcategoryListScreen(): React.ReactElement {
  const { id: slug } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { draft, setSubcategory } = useBookingStore();

  const { data: subcategories, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['subcategories', slug],
    queryFn: () => getSubcategories(slug),
    staleTime: 24 * 60 * 60 * 1000,
    enabled: !!slug,
  });

  const onRefresh = useCallback(() => { refetch(); }, [refetch]);

  const isQuoteBased = (sub: Subcategory): boolean => sub.pricingType === 'quote_based' || sub.basePrice == null;

  const handleSelect = (sub: Subcategory): void => {
    if (isQuoteBased(sub)) {
      setSubcategory(sub.id, sub.name, 0);
      router.push(Routes.CUSTOMER.BOOKING_JOB_REQUEST);
    } else {
      setSubcategory(sub.id, sub.name, sub.basePrice ?? 0);
      router.push(Routes.CUSTOMER.BOOKING_CONFIGURE);
    }
  };

  const renderItem = ({ item }: { item: Subcategory }): React.ReactElement => {
    const quoteBased = isQuoteBased(item);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handleSelect(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardContent}>
          <Text style={styles.serviceName}>{item.name}</Text>
          <Text style={styles.serviceDesc} numberOfLines={2}>
            {item.description}
          </Text>
          {item.estimatedDurationMinutes != null && (
            <Text style={styles.duration}>⏱ {item.estimatedDurationMinutes} min</Text>
          )}
        </View>
        <View style={styles.priceContainer}>
          {quoteBased ? (
            <Text style={styles.quoteLabel}>Get Quote</Text>
          ) : (
            <>
              <Text style={styles.priceLabel}>Starting at</Text>
              <Text style={styles.price}>{formatPHP(item.basePrice ?? 0)}</Text>
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{draft.categoryName ?? 'Services'}</Text>
      </View>

      {isLoading && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load services. Pull to retry.</Text>
        </View>
      )}

      <FlatList
        data={subcategories}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No services available in this category.</Text>
              {/* BUG-PHASE184-01 fix — pre-fix the empty state was a
                  dead-end. A customer landing here on a freshly-onboarded
                  market with no subcategories had no path forward. Same
                  UX-gap family as Phase 169-178. */}
              <Text style={styles.emptyHint}>
                Check back soon — providers in this category may be coming online.
              </Text>
              <TouchableOpacity
                style={styles.emptyCta}
                onPress={() => router.push(Routes.TABS.HOME)}
              >
                <Text style={styles.emptyCtaText}>Browse Other Categories</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />
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
  title: { ...typography.h3, color: colors.text, flex: 1 },
  list: { padding: spacing.base },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  cardContent: { flex: 1, marginRight: spacing.base },
  serviceName: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  serviceDesc: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.sm },
  duration: { ...typography.caption, color: colors.textTertiary },
  priceContainer: { alignItems: 'flex-end', justifyContent: 'center' },
  priceLabel: { ...typography.caption, color: colors.textTertiary, marginBottom: 2 },
  price: { ...typography.priceSmall, color: colors.primary },
  quoteLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.secondary },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorContainer: { padding: spacing.xl, alignItems: 'center' },
  errorText: { ...typography.body, color: colors.error, textAlign: 'center' },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  // BUG-PHASE184-01 fix styles for the "Browse Other Categories" CTA.
  emptyHint: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    lineHeight: 20,
  },
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
});
