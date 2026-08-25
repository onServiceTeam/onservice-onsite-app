import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { listProjects, type Project } from '@/services/project.service';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { useResponsive, byBreakpoint } from '@/hooks/useResponsive';
import { Building2, ChevronLeft, ChevronRight } from '@/components/icons';
import { SkeletonCard, EmptyState, ErrorState } from '@/components/ui';
import { buildRoute, Routes } from '@/config/navigation';

const STATUS_LABEL: Record<Project['status'], string> = {
  planning: 'Planning',
  active: 'In progress',
  on_hold: 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_COLOR: Record<Project['status'], string> = {
  planning: colors.info,
  active: colors.warning,
  on_hold: colors.textSecondary,
  completed: colors.success,
  cancelled: colors.error,
};

export default function ProjectsListScreen(): React.ReactElement {
  const router = useRouter();
  const q = useQuery({ queryKey: ['projects'], queryFn: () => listProjects(), staleTime: 30 * 1000 });
  const { breakpoint } = useResponsive();
  const numColumns = byBreakpoint(breakpoint, { phone: 1, tablet: 2, desktop: 2 });

  const renderItem = ({ item }: { item: Project }): React.ReactElement => (
    <TouchableOpacity
      style={[styles.card, numColumns > 1 && styles.cardGrid]}
      activeOpacity={0.7}
      onPress={() => router.push(buildRoute(Routes.CUSTOMER.PROJECT_DETAIL, { id: item.id }))}
      accessibilityRole="button"
      accessibilityLabel={`Open project ${item.title}`}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <View style={[styles.badge, { backgroundColor: STATUS_COLOR[item.status] + '22' }]}>
          <Text style={[styles.badgeText, { color: STATUS_COLOR[item.status] }]}>{STATUS_LABEL[item.status]}</Text>
        </View>
      </View>
      {item.description ? <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text> : null}
      <View style={styles.cardBottom}>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {[item.city, item.estimatedTotal != null ? `Est. ${formatPHP(item.estimatedTotal)}` : null].filter(Boolean).join(' · ') || 'No estimate yet'}
        </Text>
        <ChevronRight size={18} color={colors.textTertiary} />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Back from projects">
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Projects</Text>
        <TouchableOpacity onPress={() => router.push(Routes.CUSTOMER.PROJECT_NEW)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Create a new project">
          <Text style={styles.newBtn}>+ New</Text>
        </TouchableOpacity>
      </View>

      {q.isLoading ? (
        <View style={styles.body}><SkeletonCard /><SkeletonCard /></View>
      ) : q.isError ? (
        <View style={styles.body}><ErrorState message="Could not load your projects." onRetry={() => q.refetch()} /></View>
      ) : (
        <FlatList
          data={q.data ?? []}
          key={`projects-${numColumns}`}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? styles.gridRow : undefined}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
          ListHeaderComponent={
            <View style={styles.overview} accessibilityLabel="Project planning overview">
              <Text style={styles.overviewEyebrow}>MULTI-STAGE WORK</Text>
              <Text style={styles.overviewTitle}>Plan bigger work without losing the simple booking flow</Text>
              <Text style={styles.overviewText}>
                Keep milestones, choices, documents, and an early budget together here. A project is a planning record, not a provider assignment, quote, booking, or payment.
              </Text>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon={<Building2 size={48} color={colors.textTertiary} />}
              title="No projects yet"
              description="Projects are for big multi-stage jobs like a renovation or a build. Start one to plan milestones, choices, and documents in one place."
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
  newBtn: { ...typography.body, fontWeight: '700', color: colors.info },
  body: { width: '100%', maxWidth: 1120, alignSelf: 'center', padding: spacing.base, paddingBottom: 40, gap: spacing.md, flexGrow: 1 },
  overview: { backgroundColor: colors.primary, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.md },
  overviewEyebrow: { ...typography.caption, color: colors.white, fontWeight: '800', letterSpacing: 0.8, marginBottom: spacing.xs },
  overviewTitle: { ...typography.h2, color: colors.white, marginBottom: spacing.sm },
  overviewText: { ...typography.bodySmall, color: colors.primaryLight, lineHeight: 20 },
  gridRow: { gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  cardGrid: { flex: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { ...typography.body, fontWeight: '700', color: colors.text, flex: 1 },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardDesc: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, gap: spacing.sm },
  cardMeta: { ...typography.caption, color: colors.textTertiary, flex: 1 },
});
