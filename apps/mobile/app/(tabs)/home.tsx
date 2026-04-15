import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { useBookingStore } from '@/stores/booking.store';
import { getCategories, type Category } from '@/services/catalog.service';
import { getActiveBookings, getRecentBookings, type Booking } from '@/services/booking.service';
import { Badge } from '@/components/ui';
import { formatPHP } from '@/utils/currency';
import { formatRelative } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

const CATEGORY_ICONS: Record<string, string> = {
  cleaning: '🧹',
  plumbing: '🔧',
  electrical: '⚡',
  painting: '🎨',
  aircon: '❄️',
  'aircon-services': '❄️',
  pest: '🐜',
  'pest-control': '🐜',
  moving: '📦',
  carpentry: '🪚',
  appliance: '🔌',
  'appliance-repair': '🔌',
  'general-maintenance': '🔨',
};

function getBookingStatusColor(status: string): string {
  const map: Record<string, string> = {
    matched: colors.statusConfirmed,
    paid: colors.statusConfirmed,
    provider_en_route: colors.statusInProgress,
    provider_arrived: colors.statusInProgress,
    in_progress: colors.statusInProgress,
    completed_by_provider: colors.statusCompleted,
    payment_pending: colors.statusPending,
  };
  return map[status] ?? colors.textTertiary;
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const setCategory = useBookingStore((s) => s.setCategory);

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const activeBookingsQuery = useQuery({
    queryKey: ['activeBookings'],
    queryFn: getActiveBookings,
    staleTime: 60 * 1000,
  });

  const recentBookingsQuery = useQuery({
    queryKey: ['recentBookings'],
    queryFn: () => getRecentBookings(3),
    staleTime: 5 * 60 * 1000,
  });

  const isRefreshing =
    categoriesQuery.isRefetching ||
    activeBookingsQuery.isRefetching ||
    recentBookingsQuery.isRefetching;

  const onRefresh = useCallback(() => {
    void categoriesQuery.refetch();
    void activeBookingsQuery.refetch();
    void recentBookingsQuery.refetch();
  }, [categoriesQuery, activeBookingsQuery, recentBookingsQuery]);

  const handleCategoryPress = (cat: Category) => {
    setCategory(cat.id, cat.name, cat.slug);
    router.push(`/customer/category/${cat.slug}`);
  };

  const activeBookings = activeBookingsQuery.data ?? [];
  const recentBookings = recentBookingsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  const renderHeader = () => (
    <View>
      {/* Header bar */}
      <View style={[styles.headerBar, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity
          style={styles.avatarContainer}
          onPress={() => router.push('/(tabs)/profile')}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.firstName?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.locationSelector}
          onPress={() => router.push('/customer/address-picker')}
        >
          <Text style={styles.locationLabel}>Current Location</Text>
          <Text style={styles.locationValue} numberOfLines={1}>
            Select your address ▾
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.notifButton}
          onPress={() => router.push('/customer/notifications' as never)}
        >
          <Text style={styles.notifIcon}>🔔</Text>
        </TouchableOpacity>
      </View>

      {/* Active Booking Card */}
      {activeBookings.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Booking</Text>
          {activeBookings.slice(0, 1).map((booking) => (
            <TouchableOpacity
              key={booking.id}
              style={styles.activeCard}
              onPress={() => router.push(`/customer/booking/${booking.id}` as never)}
              activeOpacity={0.8}
            >
              <View style={styles.activeCardTop}>
                <Badge
                  label={booking.status.replace(/_/g, ' ').toUpperCase()}
                  backgroundColor={getBookingStatusColor(booking.status)}
                />
                <Text style={styles.activeCardTime}>
                  {formatRelative(booking.scheduledAt)}
                </Text>
              </View>
              <Text style={styles.activeCardService}>
                {booking.serviceName ?? booking.categoryName ?? 'Service'}
              </Text>
              {booking.providerName && (
                <Text style={styles.activeCardProvider}>
                  Provider: {booking.providerName}
                </Text>
              )}
              <View style={styles.activeCardCta}>
                <Text style={styles.trackText}>Track Status →</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Search Bar */}
      <Pressable
        style={styles.searchBar}
        onPress={() => router.push('/customer/search' as never)}
      >
        <Text style={styles.searchIcon}>🔍</Text>
        <Text style={styles.searchPlaceholder}>Search services or providers...</Text>
      </Pressable>

      {/* Category Grid Header */}
      <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>
        What do you need?
      </Text>
    </View>
  );

  const renderCategoryItem = ({ item }: { item: Category }) => {
    const icon = CATEGORY_ICONS[item.slug] ?? CATEGORY_ICONS[item.name.toLowerCase()] ?? '🔨';
    return (
      <TouchableOpacity
        style={styles.categoryItem}
        onPress={() => handleCategoryPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.categoryIconBg}>
          <Text style={styles.categoryIcon}>{icon}</Text>
        </View>
        <Text style={styles.categoryLabel} numberOfLines={1}>
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderFooter = () => (
    <View>
      {/* Quick Re-book */}
      {recentBookings.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Re-book</Text>
          <FlatList
            data={recentBookings}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.rebookList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.rebookCard}
                onPress={() => {
                  if (item.subcategoryId) {
                    router.push('/customer/booking/form');
                  }
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.rebookService}>
                  {item.serviceName ?? 'Service'}
                </Text>
                {item.providerName && (
                  <Text style={styles.rebookProvider}>{item.providerName}</Text>
                )}
                <Text style={styles.rebookPrice}>{formatPHP(item.totalAmount)}</Text>
                <Text style={styles.rebookCta}>Book Again</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Empty state for new users */}
      {activeBookings.length === 0 && recentBookings.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🏡</Text>
          <Text style={styles.emptyTitle}>Book your first service!</Text>
          <Text style={styles.emptySubtitle}>
            Choose a category above to get started with trusted home service professionals.
          </Text>
        </View>
      )}

      <View style={styles.bottomSpacer} />
    </View>
  );

  return (
    <FlatList
      data={categories}
      renderItem={renderCategoryItem}
      keyExtractor={(item) => item.id}
      numColumns={4}
      ListHeaderComponent={renderHeader}
      ListFooterComponent={renderFooter}
      columnWrapperStyle={styles.categoryRow}
      style={styles.container}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingBottom: 20 },

  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
    backgroundColor: colors.background,
  },
  avatarContainer: { marginRight: spacing.md },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 18 },
  locationSelector: { flex: 1 },
  locationLabel: { ...typography.caption, color: colors.textTertiary },
  locationValue: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  notifButton: { padding: spacing.sm },
  notifIcon: { fontSize: 22 },

  section: { paddingHorizontal: spacing.base, marginBottom: spacing.lg },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.md,
  },
  sectionTitleSpaced: {
    paddingHorizontal: spacing.base,
    marginTop: spacing.base,
    marginBottom: spacing.md,
  },

  activeCard: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  activeCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  activeCardTime: { ...typography.caption, color: 'rgba(255,255,255,0.7)' },
  activeCardService: {
    ...typography.h3,
    color: '#FFFFFF',
    marginBottom: spacing.xs,
  },
  activeCardProvider: {
    ...typography.bodySmall,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: spacing.md,
  },
  activeCardCta: { alignItems: 'flex-end' },
  trackText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  searchIcon: { fontSize: 16, marginRight: spacing.sm },
  searchPlaceholder: { ...typography.body, color: colors.textTertiary },

  categoryRow: {
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  categoryItem: {
    flex: 1,
    alignItems: 'center',
    maxWidth: '25%',
  },
  categoryIconBg: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  categoryIcon: { fontSize: 28 },
  categoryLabel: {
    ...typography.caption,
    color: colors.text,
    textAlign: 'center',
    fontWeight: '500',
  },

  rebookList: { paddingRight: spacing.base, gap: spacing.md },
  rebookCard: {
    width: 160,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  rebookService: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  rebookProvider: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  rebookPrice: {
    ...typography.priceSmall,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  rebookCta: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },

  emptyState: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  emptyIcon: { fontSize: 64, marginBottom: spacing.base },
  emptyTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  bottomSpacer: { height: 80 },
});
