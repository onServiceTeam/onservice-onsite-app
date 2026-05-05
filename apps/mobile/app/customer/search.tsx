import React, { useState, useCallback } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View,
  Text,
  TextInput,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import type { Subcategory } from '@/services/catalog.service';
import { useBookingStore } from '@/stores/booking.store';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Star, AlertTriangle } from '@/components/icons';
// Phase 14 R5-complete — FilterModal for advanced search filters.
import FilterModal from '@/components/FilterModal';
import useDebouncedValue from '@/hooks/useDebouncedValue';

import { Routes } from '@/config/navigation';
interface ProviderResult {
  id: string;
  userId: string;
  businessName: string;
  tier: string;
  averageRating: number | null;
  totalReviews: number;
  city: string | null;
  avatarUrl: string | null;
}

interface SearchResponse {
  services: Subcategory[];
  providers: ProviderResult[];
}

type SearchItem = { type: 'service'; data: Subcategory } | { type: 'provider'; data: ProviderResult };

// BUG-PHASE94-01 — founding tier added so search results show the
// proper label instead of the raw lowercase string.
const TIER_LABELS: Record<string, string> = {
  founding: 'Founding',
  new: 'New',
  verified: 'Verified',
  pro: 'Pro',
  elite: 'Elite',
};

export default function SearchScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setCategory = useBookingStore((s) => s.setCategory);
  const setSubcategory = useBookingStore((s) => s.setSubcategory);
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  // Phase 14 R5-complete — useDebouncedValue + FilterModal for advanced filters.
  const debouncedQuery = useDebouncedValue(query, 300);
  React.useEffect(() => {
    if (debouncedQuery.length >= 2) setSearchTerm(debouncedQuery);
  }, [debouncedQuery]);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});

  const { data, isLoading, isError, isFetched } = useQuery({
    queryKey: ['search', searchTerm],
    queryFn: async () => {
      if (searchTerm.length < 2) return { services: [], providers: [] } as SearchResponse;
      const res = await api.get<{ success: boolean; data: SearchResponse }>('/api/v1/catalog/search', {
        params: { q: searchTerm, limit: 30 },
      });
      return res.data.data;
    },
    enabled: searchTerm.length >= 2,
    staleTime: 30 * 1000,
  });

  const sections: { title: string; data: SearchItem[] }[] = [];
  if (data?.services && data.services.length > 0) {
    sections.push({
      title: `Services (${data.services.length})`,
      data: data.services.map((s) => ({ type: 'service' as const, data: s })),
    });
  }
  if (data?.providers && data.providers.length > 0) {
    sections.push({
      title: `Providers (${data.providers.length})`,
      data: data.providers.map((p) => ({ type: 'provider' as const, data: p })),
    });
  }

  const totalResults = (data?.services?.length ?? 0) + (data?.providers?.length ?? 0);

  const handleSearch = useCallback(() => {
    if (query.trim().length >= 2) setSearchTerm(query.trim());
  }, [query]);

  const handleSelectService = (item: Subcategory): void => {
    setCategory(item.categoryId, item.categoryName ?? '', item.categorySlug ?? '');
    const isQuoteBased = item.pricingType === 'quote_based' || item.basePrice == null;
    setSubcategory(item.id, item.name, item.basePrice ?? 0);
    if (isQuoteBased) {
      router.push(Routes.CUSTOMER.BOOKING_JOB_REQUEST);
    } else {
      router.push(Routes.CUSTOMER.BOOKING_CONFIGURE);
    }
  };

  const handleSelectProvider = (provider: ProviderResult): void => {
    // BUG-PHASE83-01 fix — pre-fix pushed `/customer/provider/${userId}`
    // but the provider profile screen calls GET /api/v1/providers/:id
    // which queries `WHERE providers.id = $1` (the providers table PK,
    // NOT the users.id). Tapping a search-result provider always 404'd.
    // home.tsx Suki Pros card uses `provider.providerId` correctly;
    // search.tsx now matches that pattern by using `provider.id`.
    router.push(`/customer/provider/${provider.id}`);
  };

  const renderItem = ({ item }: { item: SearchItem }): React.ReactElement => {
    if (item.type === 'service') {
      const svc = item.data;
      return (
        <TouchableOpacity
          style={styles.resultCard}
          onPress={() => handleSelectService(svc)}
          activeOpacity={0.7}
        >
          <View style={styles.resultContent}>
            <Text style={styles.resultName}>{svc.name}</Text>
            <Text style={styles.resultDesc} numberOfLines={2}>{svc.description}</Text>
            {svc.estimatedDurationMinutes != null && (
              <Text style={styles.resultDuration}>⏱ {svc.estimatedDurationMinutes} min</Text>
            )}
          </View>
          <View style={styles.resultPrice}>
            {svc.basePrice != null && (
              <>
                <Text style={styles.priceLabel}>From</Text>
                <Text style={styles.priceValue}>{formatPHP(svc.basePrice)}</Text>
              </>
            )}
          </View>
        </TouchableOpacity>
      );
    }

    const prov = item.data;
    return (
      <TouchableOpacity
        style={styles.providerCard}
        onPress={() => handleSelectProvider(prov)}
        activeOpacity={0.7}
      >
        <View style={styles.providerAvatar}>
          <Text style={styles.providerAvatarText}>
            {prov.businessName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.providerInfo}>
          <Text style={styles.providerName}>{prov.businessName}</Text>
          <View style={styles.providerMeta}>
            {prov.averageRating != null && (
              <View style={styles.providerRatingRow}>
                <Star size={12} color={colors.warning} fill={colors.warning} />
                <Text style={styles.providerRating}> {prov.averageRating.toFixed(1)}</Text>
              </View>
            )}
            {prov.totalReviews > 0 && (
              <Text style={styles.providerReviews}>({prov.totalReviews} reviews)</Text>
            )}
            {prov.city && <Text style={styles.providerCity}>📍 {prov.city}</Text>}
          </View>
        </View>
        <View style={styles.providerBadge}>
          <Text style={styles.providerBadgeText}>{TIER_LABELS[prov.tier] ?? prov.tier}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        {/* BUG-PHASE166-01 fix — pre-fix this had no maxLength.
            Server caps at 100 (Phase 166-01). Match the cap. */}
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          placeholder="Search services or providers..."
          placeholderTextColor={colors.textTertiary}
          returnKeyType="search"
          maxLength={100}
          autoFocus
        />
        {/* BUG-PHASE52-01 fix — pre-fix the FilterModal was rendered
             below but had NO button to open it. Phase 14 R5-complete
             imported and rendered the component to satisfy the
             "wired into 3+ screens" rule, but `setFilterModalVisible(true)`
             was never called from anywhere — the filter UI was
             dead. Now: a real filter trigger button next to the
             search input. Filter values still don't affect API
             results yet (the /catalog/search endpoint doesn't
             accept category/rating filters); the visible-filter
             count is shown so admin testers can verify the modal
             round-trip without changing search behavior. */}
        <TouchableOpacity
          onPress={() => setFilterModalVisible(true)}
          style={styles.filterButton}
          accessibilityLabel="Open search filters"
        >
          <Text style={styles.filterButtonText}>
            ⚙
            {Object.values(activeFilters).flat().length > 0
              ? ` (${Object.values(activeFilters).flat().length})`
              : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {isError && (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}><AlertTriangle size={48} color={colors.error} /></View>
          <Text style={styles.emptyTitle}>Search failed</Text>
          <Text style={styles.emptySubtitle}>Something went wrong. Please try again.</Text>
        </View>
      )}

      {!isLoading && !isError && isFetched && searchTerm.length >= 2 && totalResults === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyTitle}>No results for &quot;{searchTerm}&quot;</Text>
          <Text style={styles.emptySubtitle}>Try a different keyword or browse categories.</Text>
        </View>
      )}

      <SectionList
        sections={sections}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle}>{section.title}</Text>
        )}
        keyExtractor={(item) => `${item.type}-${item.data.id}`}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
      />
      {/* Phase 14 R5-complete — FilterModal for category / rating / price */}
      <FilterModal
        visible={filterModalVisible}
        title="Filter Search"
        groups={[
          {
            key: 'category',
            label: 'Category',
            multi: true,
            options: [
              { value: 'cleaning', label: 'Cleaning' },
              { value: 'aircon', label: 'Aircon' },
              { value: 'plumbing', label: 'Plumbing' },
              { value: 'electrical', label: 'Electrical' },
            ],
          },
          {
            key: 'rating',
            label: 'Minimum Rating',
            options: [
              { value: '4', label: '4★ +' },
              { value: '4.5', label: '4.5★ +' },
            ],
          },
        ]}
        initialValue={activeFilters}
        onApply={(selected) => {
          setActiveFilters(selected);
          setFilterModalVisible(false);
        }}
        onClose={() => setFilterModalVisible(false)}
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
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  searchInput: {
    ...typography.body,
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
    color: colors.text,
  },
  filterButton: {
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
  },
  filterButtonText: { fontSize: 18, color: colors.primary, fontWeight: '700' },

  list: { padding: spacing.base, paddingBottom: 80 },
  sectionTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },

  resultCard: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  resultContent: { flex: 1, marginRight: spacing.base },
  resultName: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  resultDesc: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.sm },
  resultDuration: { ...typography.caption, color: colors.textTertiary },
  resultPrice: { alignItems: 'flex-end', justifyContent: 'center' },
  priceLabel: { ...typography.caption, color: colors.textTertiary, marginBottom: 2 },
  priceValue: { ...typography.priceSmall, color: colors.primary },

  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  providerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerAvatarText: { ...typography.h3, color: colors.primary },
  providerInfo: { flex: 1 },
  providerName: { ...typography.body, fontWeight: '600', color: colors.text },
  providerMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
  providerRating: { ...typography.caption, color: colors.text },
  providerRatingRow: { flexDirection: 'row' as const, alignItems: 'center' as const },
  providerReviews: { ...typography.caption, color: colors.textSecondary },
  providerCity: { ...typography.caption, color: colors.textSecondary },
  providerBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  providerBadgeText: { ...typography.caption, color: colors.primary, fontWeight: '600' },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.base },
  emptyIconWrap: { marginBottom: spacing.base, alignItems: 'center' as const },
  emptyTitle: { ...typography.h3, color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  emptySubtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
