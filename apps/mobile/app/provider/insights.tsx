import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getCategoryInsights, type CategoryInsight } from '@/services/provider-crm.service';
import { formatPHP } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { BarChart3, ChevronLeft, Star } from '@/components/icons';
import { SkeletonCard, EmptyState, ErrorState } from '@/components/ui';

export default function InsightsScreen(): React.ReactElement {
  const router = useRouter();
  const q = useQuery({ queryKey: ['provider-insights'], queryFn: getCategoryInsights, staleTime: 5 * 60 * 1000 });

  const renderItem = ({ item }: { item: CategoryInsight }): React.ReactElement => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cat}>{item.categoryName}</Text>
        {item.avgRating != null ? (
          <View style={styles.ratingPill}>
            <Star size={12} color={colors.warning} />
            <Text style={styles.ratingText}>{item.avgRating.toFixed(1)}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{item.jobCount}</Text>
          <Text style={styles.statLabel}>jobs</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{item.completionRate}%</Text>
          <Text style={styles.statLabel}>completed</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{formatPHP(item.totalValue)}</Text>
          <Text style={styles.statLabel}>job value</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Insights by category</Text>
        <View style={{ width: 24 }} />
      </View>

      {q.isLoading ? (
        <View style={styles.body}><SkeletonCard /><SkeletonCard /></View>
      ) : q.isError ? (
        <View style={styles.body}><ErrorState message={getErrorMessage(q.error, 'Could not load your insights.')} onRetry={() => q.refetch()} /></View>
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(c, i) => c.categoryId ?? `none-${i}`}
          renderItem={renderItem}
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
          ListHeaderComponent={(q.data?.length ?? 0) > 0 ? <Text style={styles.intro}>How your work breaks down across the services you offer. Job value is gross, before platform commission.</Text> : null}
          ListEmptyComponent={<EmptyState icon={<BarChart3 size={48} color={colors.textTertiary} />} title="No insights yet" description="Once you complete jobs, your performance by service category shows up here." />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { ...typography.h3, color: colors.text },
  body: { padding: spacing.base, paddingBottom: 40, gap: spacing.md, flexGrow: 1 },
  intro: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.sm, lineHeight: 17 },
  card: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cat: { ...typography.body, fontWeight: '700', color: colors.text },
  ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.warningLight, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.full },
  ratingText: { ...typography.caption, color: colors.warning, fontWeight: '700' },
  statsRow: { flexDirection: 'row', marginTop: spacing.md, gap: spacing.base },
  stat: { flex: 1 },
  statNum: { ...typography.body, fontWeight: '800', color: colors.text },
  statLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
});
