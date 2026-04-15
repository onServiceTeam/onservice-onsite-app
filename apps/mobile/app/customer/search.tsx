import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
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

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setCategory = useBookingStore((s) => s.setCategory);
  const setSubcategory = useBookingStore((s) => s.setSubcategory);
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const { data: results, isLoading, isFetched } = useQuery({
    queryKey: ['search', searchTerm],
    queryFn: async () => {
      if (searchTerm.length < 2) return [];
      const res = await api.get<{ success: boolean; data: Subcategory[] }>('/api/v1/catalog/search', {
        params: { q: searchTerm, limit: 30 },
      });
      return res.data.data;
    },
    enabled: searchTerm.length >= 2,
    staleTime: 30 * 1000,
  });

  const handleSearch = useCallback(() => {
    if (query.trim().length >= 2) setSearchTerm(query.trim());
  }, [query]);

  const handleSelect = (item: Subcategory) => {
    setCategory(item.categoryId, item.categoryName ?? '', item.categorySlug ?? '');
    const isQuoteBased = item.pricingType === 'quote_based' || item.basePrice == null;
    setSubcategory(item.id, item.name, item.basePrice ?? 0);
    if (isQuoteBased) {
      router.push('/customer/booking/job-request');
    } else {
      router.push('/customer/booking/form');
    }
  };

  const renderResult = ({ item }: { item: Subcategory }) => (
    <TouchableOpacity
      style={styles.resultCard}
      onPress={() => handleSelect(item)}
      activeOpacity={0.7}
    >
      <View style={styles.resultContent}>
        <Text style={styles.resultName}>{item.name}</Text>
        <Text style={styles.resultDesc} numberOfLines={2}>{item.description}</Text>
        {item.estimatedDurationMinutes != null && (
          <Text style={styles.resultDuration}>⏱ {item.estimatedDurationMinutes} min</Text>
        )}
      </View>
      <View style={styles.resultPrice}>
        {item.basePrice != null && (
          <>
            <Text style={styles.priceLabel}>From</Text>
            <Text style={styles.priceValue}>{formatPHP(item.basePrice)}</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          placeholder="Search services or providers..."
          placeholderTextColor={colors.textTertiary}
          returnKeyType="search"
          autoFocus
        />
      </View>

      {isLoading && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {!isLoading && isFetched && searchTerm.length >= 2 && (results?.length ?? 0) === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyTitle}>No results for "{searchTerm}"</Text>
          <Text style={styles.emptySubtitle}>Try a different keyword or browse categories.</Text>
        </View>
      )}

      <FlatList
        data={results ?? []}
        renderItem={renderResult}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          results && results.length > 0 ? (
            <Text style={styles.resultCount}>{results.length} result{results.length !== 1 ? 's' : ''}</Text>
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
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm },
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

  list: { padding: spacing.base, paddingBottom: 80 },
  resultCount: { ...typography.bodySmall, color: colors.textTertiary, marginBottom: spacing.md },

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

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.base },
  emptyTitle: { ...typography.h3, color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  emptySubtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
