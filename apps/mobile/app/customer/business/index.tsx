import React from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { getBusinessAccounts, type BusinessAccount } from '@/services/business.service';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { useResponsive, byBreakpoint } from '@/hooks/useResponsive';
import { Building2, ChevronLeft, ChevronRight } from '@/components/icons';
import { EmptyState, ErrorState, SkeletonCard } from '@/components/ui';
import Badge from '@/components/ui/Badge';
import { buildRoute, Routes } from '@/config/navigation';

const STATUS_STYLE: Record<string, { color: string; background: string }> = {
  active: { color: colors.successDark, background: colors.successLight },
  pending: { color: colors.warningDark, background: colors.warningLight },
  suspended: { color: colors.error, background: colors.errorLight },
  closed: { color: colors.textSecondary, background: colors.backgroundSecondary },
};

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function BusinessAccountsScreen(): React.ReactElement {
  const router = useRouter();
  const { breakpoint } = useResponsive();
  const columns = byBreakpoint(breakpoint, { phone: 1, tablet: 2, desktop: 3 });
  const query = useInfiniteQuery({
    queryKey: ['customer-business-accounts'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => getBusinessAccounts(pageParam, 20),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((total, page) => total + page.items.length, 0);
      return loaded < lastPage.total ? pages.length + 1 : undefined;
    },
  });
  const accounts = Array.from(new Map(
    (query.data?.pages ?? []).flatMap((page) => page.items).map((account) => [account.id, account]),
  ).values());

  const renderAccount = ({ item }: { item: BusinessAccount }): React.ReactElement => {
    const status = STATUS_STYLE[item.status] ?? STATUS_STYLE.closed!;
    return (
      <TouchableOpacity
        style={[styles.card, columns > 1 && styles.cardGrid]}
        onPress={() => router.push(buildRoute(Routes.CUSTOMER.BUSINESS_ACCOUNT_DETAIL, { id: item.id }))}
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.companyName} company workspace`}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.companyIcon}><Building2 size={22} color={colors.primary} /></View>
          <Badge label={label(item.status)} color={status.color} backgroundColor={status.background} />
        </View>
        <Text style={styles.companyName} numberOfLines={2}>{item.companyName}</Text>
        <Text style={styles.companyMeta}>{label(item.businessType)} · {item.city}, {item.province}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.cardLink}>Open company records</Text>
          <ChevronRight size={18} color={colors.primary} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back from company workspaces"
          style={styles.headerButton}
        >
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Company workspaces</Text>
        <View style={styles.headerButton} />
      </View>

      {query.isLoading ? (
        <View style={styles.content}><SkeletonCard /><SkeletonCard /></View>
      ) : query.isError ? (
        <ErrorState
          title="Company workspaces unavailable"
          message="We couldn't load the companies linked to your account."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <FlatList
          data={accounts}
          renderItem={renderAccount}
          keyExtractor={(account) => account.id}
          key={`business-accounts-${columns}`}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? styles.gridRow : undefined}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={(
            <View style={styles.hero} accessibilityLabel="Company workspace introduction">
              <Text style={styles.eyebrow}>WORK FOR A COMPANY</Text>
              <Text style={styles.heroTitle}>Keep company services separate from personal bookings</Text>
              <Text style={styles.heroText}>
                Review your company role, approved commercial terms, provider contracts, team access, and finalized statements in one place.
              </Text>
            </View>
          )}
          ListEmptyComponent={(
            <EmptyState
              icon={<Building2 size={48} color={colors.textTertiary} />}
              title="No company workspace linked"
              description="When a company owner adds your onService account, its workspace and your permissions will appear here. Personal bookings stay separate."
            />
          )}
          ListFooterComponent={query.isFetchingNextPage ? <SkeletonCard /> : null}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h3, color: colors.text },
  content: {
    width: '100%', maxWidth: 1180, alignSelf: 'center', padding: spacing.base,
    paddingBottom: 80, gap: spacing.md, flexGrow: 1,
  },
  hero: { backgroundColor: colors.primary, borderRadius: borderRadius.xl, padding: spacing.lg, marginBottom: spacing.md },
  eyebrow: { ...typography.caption, color: colors.white, fontWeight: '800', letterSpacing: 0.8, marginBottom: spacing.xs },
  heroTitle: { ...typography.h2, color: colors.white, marginBottom: spacing.sm },
  heroText: { ...typography.bodySmall, color: colors.primaryLight, lineHeight: 21 },
  gridRow: { gap: spacing.md },
  cardGrid: { flex: 1 },
  card: {
    backgroundColor: colors.surface, borderRadius: borderRadius.xl, padding: spacing.base,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  companyIcon: { width: 42, height: 42, borderRadius: borderRadius.lg, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  companyName: { ...typography.h3, color: colors.text },
  companyMeta: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.md, marginTop: spacing.base },
  cardLink: { ...typography.bodySmall, color: colors.primary, fontWeight: '700' },
});
