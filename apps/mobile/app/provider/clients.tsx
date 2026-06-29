import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getProviderClients, type ProviderClient } from '@/services/provider-crm.service';
import { formatPHP } from '@/utils/currency';
import { formatRelative } from '@/utils/date';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { useResponsive, byBreakpoint } from '@/hooks/useResponsive';
import { ChevronLeft } from '@/components/icons';
import { SkeletonCard, EmptyState, ErrorState } from '@/components/ui';

export default function ProviderClientsScreen(): React.ReactElement {
  const router = useRouter();
  const q = useQuery({ queryKey: ['provider-clients'], queryFn: getProviderClients, staleTime: 60 * 1000 });
  const { breakpoint } = useResponsive();
  const numColumns = byBreakpoint(breakpoint, { phone: 1, tablet: 2, desktop: 2 });

  const renderItem = ({ item }: { item: ProviderClient }): React.ReactElement => (
    <View style={[styles.card, numColumns > 1 && styles.cardGrid]}>
      <View style={styles.cardTop}>
        <Text style={styles.name} numberOfLines={1}>{item.customerName}</Text>
        <Text style={styles.value}>{formatPHP(item.totalJobValue)}</Text>
      </View>
      <View style={styles.statsRow}>
        <Text style={styles.stat}>{item.jobCount} job{item.jobCount !== 1 ? 's' : ''}</Text>
        <Text style={styles.statDot}>·</Text>
        <Text style={styles.stat}>{item.completedCount} completed</Text>
        {item.lastJobAt ? (
          <>
            <Text style={styles.statDot}>·</Text>
            <Text style={styles.stat}>last {formatRelative(item.lastJobAt)}</Text>
          </>
        ) : null}
      </View>
      {item.jobCount > 1 ? <Text style={styles.repeat}>Repeat client</Text> : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>My Clients</Text>
        <View style={{ width: 24 }} />
      </View>

      {q.isLoading ? (
        <View style={styles.body}><SkeletonCard /><SkeletonCard /></View>
      ) : q.isError ? (
        <View style={styles.body}><ErrorState message={getErrorMessage(q.error, 'Could not load your clients.')} onRetry={() => q.refetch()} /></View>
      ) : (
        <FlatList
          data={q.data ?? []}
          key={`clients-${numColumns}`}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? styles.gridRow : undefined}
          keyExtractor={(c) => c.customerId}
          renderItem={renderItem}
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
          ListHeaderComponent={
            (q.data?.length ?? 0) > 0 ? (
              <Text style={styles.intro}>The customers you've worked with, repeat clients first. Job value is the gross service price, before platform commission.</Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="👥"
              title="No clients yet"
              description="Once you complete jobs, the customers you've served show up here so you can see your repeat business."
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { ...typography.h3, color: colors.text },
  body: { padding: spacing.base, paddingBottom: 40, gap: spacing.md, flexGrow: 1 },
  intro: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.sm, lineHeight: 17 },
  gridRow: { gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  cardGrid: { flex: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  name: { ...typography.body, fontWeight: '700', color: colors.text, flex: 1 },
  value: { ...typography.body, fontWeight: '800', color: colors.text },
  statsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: spacing.xs },
  stat: { ...typography.caption, color: colors.textSecondary },
  statDot: { ...typography.caption, color: colors.textTertiary },
  repeat: { ...typography.caption, color: colors.success, fontWeight: '700', marginTop: spacing.xs },
});
