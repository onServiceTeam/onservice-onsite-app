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
import { byBreakpoint, useResponsive } from '@/hooks/useResponsive';

export default function InsightsScreen(): React.ReactElement {
  const router = useRouter();
  const { isPhone, breakpoint } = useResponsive();
  const numColumns = byBreakpoint(breakpoint, { phone: 1, tablet: 2, desktop: 2 });
  const q = useQuery({ queryKey: ['provider-insights'], queryFn: getCategoryInsights, staleTime: 5 * 60 * 1000 });

  const renderItem = ({ item }: { item: CategoryInsight }): React.ReactElement => (
    <View style={[styles.card, numColumns > 1 && styles.cardWide]}>
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
          <Text style={styles.statNum}>{formatPHP(item.completedValue)}</Text>
          <Text style={styles.statLabel}>completed value</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={[styles.headerInner, !isPhone && styles.headerInnerWide]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Insights by category</Text>
          <View style={{ width: 24 }} />
        </View>
      </View>

      {q.isLoading ? (
        <View style={[styles.body, !isPhone && styles.bodyWide]}><SkeletonCard /><SkeletonCard /></View>
      ) : q.isError ? (
        <View style={[styles.body, !isPhone && styles.bodyWide]}><ErrorState message={getErrorMessage(q.error, 'Could not load your insights.')} onRetry={() => q.refetch()} /></View>
      ) : (
        <FlatList
          key={`insights-${numColumns}`}
          data={q.data ?? []}
          keyExtractor={(c, i) => c.categoryId ?? `none-${i}`}
          renderItem={renderItem}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? styles.columns : undefined}
          contentContainerStyle={[styles.body, !isPhone && styles.bodyWide]}
          accessibilityLabel={isPhone ? 'Provider category insights' : 'Tablet and desktop provider category insights workspace'}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
          ListHeaderComponent={(q.data?.length ?? 0) > 0 ? (
            <View style={styles.definitionCard}>
              <Text style={styles.definitionTitle}>What these numbers mean</Text>
              <Text style={styles.intro}>All-time bookings assigned to your provider account, grouped by the booking's catalog category. Completion rate counts bookings confirmed, payout-ready, paid out, or marked completed by the provider, divided by all assigned bookings.</Text>
              <Text style={styles.intro}>Completed value is the recorded service price for those completed/provider-completed states, before platform commission. It excludes fees, change orders, tips, refunds, and payouts. Average rating uses visible customer reviews only.</Text>
              <Text style={styles.loadedAt}>Loaded {new Date(q.dataUpdatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}. Pull down to refresh.</Text>
            </View>
          ) : null}
          ListEmptyComponent={<EmptyState icon={<BarChart3 size={48} color={colors.textTertiary} />} title="No insights yet" description="Once you complete jobs, your performance by service category shows up here." />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  headerInnerWide: { width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: spacing.xl },
  headerTitle: { ...typography.h3, color: colors.text },
  body: { padding: spacing.base, paddingBottom: 40, gap: spacing.md, flexGrow: 1 },
  bodyWide: { width: '100%', maxWidth: 1120, alignSelf: 'center', padding: spacing.xl },
  columns: { gap: spacing.md, alignItems: 'stretch' },
  definitionCard: { backgroundColor: colors.primaryDark, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.md, gap: spacing.sm },
  definitionTitle: { ...typography.h3, color: colors.white },
  intro: { ...typography.caption, color: colors.primaryLight, lineHeight: 18 },
  loadedAt: { ...typography.caption, color: colors.white, fontWeight: '600', marginTop: spacing.xs },
  card: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  cardWide: { flex: 1, minWidth: 0 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cat: { ...typography.body, fontWeight: '700', color: colors.text },
  ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.warningLight, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.full },
  ratingText: { ...typography.caption, color: colors.warning, fontWeight: '700' },
  statsRow: { flexDirection: 'row', marginTop: spacing.md, gap: spacing.base },
  stat: { flex: 1 },
  statNum: { ...typography.body, fontWeight: '800', color: colors.text },
  statLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
});
