import React from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getProviderSukiCustomers, type SukiCustomer } from '@/services/suki.service';
import { formatPHP } from '@/utils/currency';
import { Routes, buildRoute } from '@/config/navigation';
import { useResponsive } from '@/hooks/useResponsive';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import type { ComponentType } from 'react';
import { Sparkle, Star, Award, Crown, Heart } from '@/components/icons';
// A7 — shared UI kit for loading/empty/error states.
import { SkeletonCard, EmptyState, ErrorState } from '@/components/ui';

type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

const TIER_DISPLAY: Record<string, { label: string; icon: IconComponent; color: string }> = {
  new: { label: 'New', icon: Sparkle, color: colors.textSecondary },
  regular: { label: 'Regular', icon: Star, color: colors.textSecondary },
  suki: { label: 'Suki', icon: Award, color: colors.warning },
  super_suki: { label: 'Super Suki', icon: Crown, color: colors.error },
};

function CustomerCard({
  customer,
  onOpen,
}: {
  customer: SukiCustomer;
  onOpen: () => void;
}): React.ReactElement {
  const tierInfo = TIER_DISPLAY[customer.tier] ?? TIER_DISPLAY.new!;
  const TierIcon = tierInfo.icon;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Open ${customer.customerName} client record`}
    >
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{customer.customerName[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.customerName}>{customer.customerName}</Text>
          <View style={styles.tierRow}>
            <TierIcon size={12} color={tierInfo.color} />
            <Text style={[styles.tierLabel, { color: tierInfo.color }]}>{tierInfo.label}</Text>
          </View>
        </View>
        {customer.discount > 0 && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>{customer.discount}% off</Text>
          </View>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{customer.totalBookings}</Text>
          <Text style={styles.statLabel}>Bookings</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatPHP(customer.totalSpent)}</Text>
          <Text style={styles.statLabel}>Total Spent</Text>
        </View>
        {customer.lastBookingAt && (
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {new Date(customer.lastBookingAt).toLocaleDateString('en-PH', {
                month: 'short',
                day: 'numeric',
                timeZone: 'Asia/Manila',
              })}
            </Text>
            <Text style={styles.statLabel}>Last Booking</Text>
          </View>
        )}
      </View>
      <Text style={styles.openRecord}>Open client record</Text>
    </TouchableOpacity>
  );
}

export default function ProviderSukiCustomersScreen(): React.ReactElement {
  const router = useRouter();
  const { isPhone } = useResponsive();

  const {
    data: customers,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['providerSukiCustomers'],
    queryFn: getProviderSukiCustomers,
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Suki Customers</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      {isLoading ? (
        <View style={styles.listContent}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : isError ? (
        <ErrorState
          message="We couldn't load your Suki customers. Please check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : (
        <View
          style={styles.listFrame}
          accessibilityLabel={
            !isPhone ? 'Tablet and desktop provider Suki CRM workspace' : undefined
          }
        >
          <FlatList
            key={isPhone ? 'phone-suki-list' : 'wide-suki-grid'}
            data={customers ?? []}
            renderItem={({ item }) => (
              <CustomerCard
                customer={item}
                onOpen={() =>
                  router.push(buildRoute(Routes.PROVIDER.CLIENT_DETAIL, { id: item.customerId }))
                }
              />
            )}
            keyExtractor={(item) => item.id}
            numColumns={isPhone ? 1 : 2}
            columnWrapperStyle={!isPhone ? styles.columnWrapper : undefined}
            contentContainerStyle={[styles.listContent, !isPhone && styles.listContentWide]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={() => void refetch()}
                tintColor={colors.secondary}
                colors={[colors.secondary]}
              />
            }
            ListHeaderComponent={
              <View style={styles.heroSection}>
                <View style={styles.heroEmojiWrap}>
                  <Heart size={48} color={colors.primary} />
                </View>
                <Text style={styles.heroTitle}>Your Repeat Customers</Text>
                <Text style={styles.heroDesc}>
                  Customers who book you multiple times build Suki loyalty and earn discounts.
                </Text>
              </View>
            }
            ListEmptyComponent={
              <EmptyState
                icon={<Heart size={48} color={colors.textTertiary} />}
                title="No Suki Customers Yet"
                description="As customers rebook your services, they will appear here with their loyalty tier and stats."
              />
            }
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  headerPlaceholder: { width: 30 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  errorEmoji: { fontSize: 48, marginBottom: spacing.md },
  errorEmojiWrap: { marginBottom: spacing.md, alignItems: 'center' as const },
  errorText: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  retryButton: { marginTop: spacing.sm },
  retryText: { ...typography.body, color: colors.secondary, fontWeight: '600' },
  listContent: { padding: spacing.base, paddingBottom: 40 },
  listFrame: { flex: 1 },
  listContentWide: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: spacing.lg },
  columnWrapper: { gap: spacing.lg },
  heroSection: { alignItems: 'center', marginBottom: spacing.lg },
  heroEmoji: { fontSize: 48, marginBottom: spacing.sm },
  heroEmojiWrap: { marginBottom: spacing.sm, alignItems: 'center' as const },
  heroTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.xs },
  heroDesc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: { color: colors.white, fontWeight: '700', fontSize: 18 },
  cardInfo: { flex: 1 },
  customerName: { ...typography.body, fontWeight: '700', color: colors.text },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  tierEmoji: { fontSize: 12 },
  tierLabel: { ...typography.caption, fontWeight: '600' },
  discountBadge: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  discountText: { ...typography.caption, fontWeight: '700', color: colors.success },
  statsRow: { flexDirection: 'row', gap: spacing.md },
  openRecord: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '700',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { ...typography.body, fontWeight: '700', color: colors.text },
  statLabel: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  emptyBox: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
  emptyEmojiWrap: { marginBottom: spacing.md, alignItems: 'center' as const },
  emptyTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  emptyDesc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
});
