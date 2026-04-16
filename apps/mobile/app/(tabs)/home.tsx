import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { useBookingStore } from '@/stores/booking.store';
import { getCategories, getActivePromotions, type Category, type Promotion } from '@/services/catalog.service';
import { getActiveBookings, getRecentBookings } from '@/services/booking.service';
import api from '@/services/api';
import { Badge } from '@/components/ui';
import { formatPHP } from '@/utils/currency';
import { formatRelative } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

interface SukiProvider {
  id: string;
  providerId: string;
  providerName: string;
  tier: string;
  totalBookings: number;
  discount: number;
}

async function getSukiProviders(): Promise<SukiProvider[]> {
  const res = await api.get<{ success: boolean; data: SukiProvider[] }>('/api/v1/suki/memberships', {
    params: { page: 1, pageSize: 10 },
  });
  return (res.data.data ?? []).filter((m) => m.totalBookings >= 3);
}

async function getUnreadNotificationCount(): Promise<number> {
  const res = await api.get<{ success: boolean; meta: { unread: number } }>('/api/v1/notifications', {
    params: { page: 1, pageSize: 1 },
  });
  return res.data.meta?.unread ?? 0;
}

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

export default function HomeScreen(): React.ReactElement {
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

  const promosQuery = useQuery({
    queryKey: ['activePromotions'],
    queryFn: getActivePromotions,
    staleTime: 10 * 60 * 1000,
  });

  const sukiQuery = useQuery({
    queryKey: ['sukiProviders'],
    queryFn: getSukiProviders,
    staleTime: 5 * 60 * 1000,
  });

  const unreadQuery = useQuery({
    queryKey: ['notifUnread'],
    queryFn: getUnreadNotificationCount,
    staleTime: 60 * 1000,
  });

  const isRefreshing =
    categoriesQuery.isRefetching ||
    activeBookingsQuery.isRefetching ||
    recentBookingsQuery.isRefetching;

  const onRefresh = useCallback(() => {
    void categoriesQuery.refetch();
    void activeBookingsQuery.refetch();
    void recentBookingsQuery.refetch();
    void promosQuery.refetch();
    void sukiQuery.refetch();
    void unreadQuery.refetch();
  }, [categoriesQuery, activeBookingsQuery, recentBookingsQuery, promosQuery, sukiQuery, unreadQuery]);

  const handleCategoryPress = (cat: Category): void => {
    setCategory(cat.id, cat.name, cat.slug);
    router.push(`/customer/category/${cat.slug}`);
  };

  const activeBookings = activeBookingsQuery.data ?? [];
  const recentBookings = recentBookingsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const promotions = promosQuery.data ?? [];
  const sukiProviders = sukiQuery.data ?? [];
  const unreadCount = unreadQuery.data ?? 0;

  const renderHeader = (): React.ReactElement => (
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
          {unreadCount > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
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

      {/* Promo Carousel */}
      {promotions.length > 0 && (
        <View style={styles.promoSection}>
          <FlatList
            data={promotions}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item: Promotion) => item.id}
            contentContainerStyle={styles.promoList}
            renderItem={({ item }: { item: Promotion }): React.ReactElement => (
              <TouchableOpacity
                style={styles.promoCard}
                onPress={() => {
                  if (item.ctaLink) router.push(item.ctaLink as never);
                }}
                activeOpacity={0.85}
              >
                {item.badge && (
                  <View style={styles.promoBadge}>
                    <Text style={styles.promoBadgeText}>{item.badge}</Text>
                  </View>
                )}
                <Text style={styles.promoTitle}>{item.title}</Text>
                {item.subtitle && (
                  <Text style={styles.promoSubtitle}>{item.subtitle}</Text>
                )}
                {item.ctaText && (
                  <View style={styles.promoCta}>
                    <Text style={styles.promoCtaText}>{item.ctaText}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Category Grid Header */}
      <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>
        What do you need?
      </Text>
    </View>
  );

  const renderCategoryItem = ({ item }: { item: Category }): React.ReactElement => {
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

  const renderFooter = (): React.ReactElement => (
    <View>
      {/* Suki Providers */}
      {sukiProviders.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Your Suki Pros</Text>
            <TouchableOpacity onPress={() => router.push('/customer/suki-pros' as never)}>
              <Text style={styles.seeAllLink}>See all &gt;</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={sukiProviders}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.sukiList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.sukiCard}
                onPress={() => router.push(`/customer/provider/${item.providerId}` as never)}
                activeOpacity={0.7}
              >
                <View style={styles.sukiAvatar}>
                  <Text style={styles.sukiAvatarText}>
                    {item.providerName?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
                <Text style={styles.sukiName} numberOfLines={1}>{item.providerName}</Text>
                <Text style={styles.sukiTier}>{item.tier.replace(/_/g, ' ')}</Text>
                {item.discount > 0 && (
                  <Text style={styles.sukiDiscount}>{item.discount}% off</Text>
                )}
                <TouchableOpacity
                  style={styles.sukiBookBtn}
                  onPress={() => router.push('/customer/booking/form' as never)}
                >
                  <Text style={styles.sukiBookText}>Book</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

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

      {/* SiguradoShield Banner */}
      <TouchableOpacity
        style={styles.shieldBanner}
        onPress={() => router.push('/customer/safety' as never)}
        activeOpacity={0.7}
      >
        <Text style={styles.shieldBannerIcon}>🛡️</Text>
        <View style={styles.shieldBannerContent}>
          <Text style={styles.shieldBannerTitle}>SiguradoShield™ Protection</Text>
          <Text style={styles.shieldBannerText}>
            Every booking is covered up to ₱50,000. Learn more →
          </Text>
        </View>
      </TouchableOpacity>

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

  if (categoriesQuery.isLoading) {
    return (
      <View style={[styles.container, styles.centeredState, { paddingTop: insets.top + 80 }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading services...</Text>
      </View>
    );
  }

  if (categoriesQuery.isError && categories.length === 0) {
    return (
      <View style={[styles.container, styles.centeredState, { paddingTop: insets.top + 80 }]}>
        <Text style={styles.emptyIcon}>⚠️</Text>
        <Text style={styles.emptyTitle}>Could not load services</Text>
        <Text style={styles.emptySubtitle}>Please check your connection and try again.</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.retryBtn}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
  avatarText: { color: colors.white, fontWeight: '700', fontSize: 18 },
  locationSelector: { flex: 1 },
  locationLabel: { ...typography.caption, color: colors.textTertiary },
  locationValue: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  notifButton: { padding: spacing.sm, position: 'relative' as const },
  notifIcon: { fontSize: 22 },
  notifBadge: {
    position: 'absolute' as const,
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.error,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 4,
  },
  notifBadgeText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: colors.white,
  },

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
    color: colors.white,
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
    color: colors.white,
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

  sectionHeaderRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: spacing.md,
  },
  seeAllLink: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600' as const,
  },
  sukiList: { paddingRight: spacing.base, gap: spacing.md },
  sukiCard: {
    width: 120,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center' as const,
  },
  sukiAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: spacing.sm,
  },
  sukiAvatarText: { color: colors.white, fontWeight: '700' as const, fontSize: 20 },
  sukiName: {
    ...typography.caption,
    fontWeight: '600' as const,
    color: colors.text,
    textAlign: 'center' as const,
    marginBottom: 2,
  },
  sukiTier: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 10,
    textTransform: 'capitalize' as const,
    marginBottom: spacing.xs,
  },
  sukiDiscount: {
    ...typography.caption,
    color: colors.statusCompleted,
    fontWeight: '600' as const,
    marginBottom: spacing.sm,
  },
  sukiBookBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.sm,
  },
  sukiBookText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600' as const,
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

  promoSection: {
    marginBottom: spacing.sm,
  },
  promoList: {
    paddingHorizontal: spacing.base,
    gap: spacing.md,
  },
  promoCard: {
    width: 280,
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    minHeight: 120,
    justifyContent: 'flex-end' as const,
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  promoBadge: {
    position: 'absolute' as const,
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  promoBadgeText: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '700' as const,
    fontSize: 10,
    textTransform: 'uppercase' as const,
  },
  promoTitle: {
    ...typography.body,
    fontWeight: '700' as const,
    color: colors.white,
    marginBottom: 4,
  },
  promoSubtitle: {
    ...typography.bodySmall,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: spacing.sm,
  },
  promoCta: {
    alignSelf: 'flex-start' as const,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  promoCtaText: {
    ...typography.caption,
    color: colors.secondary,
    fontWeight: '700' as const,
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

  shieldBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.infoLight,
    marginHorizontal: spacing.base,
    marginTop: spacing.lg,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.info,
  },
  shieldBannerIcon: { fontSize: 28, marginRight: spacing.md },
  shieldBannerContent: { flex: 1 },
  shieldBannerTitle: { ...typography.body, fontWeight: '700', color: colors.infoDark, marginBottom: 2 },
  shieldBannerText: { ...typography.bodySmall, color: colors.info },

  bottomSpacer: { height: 80 },
  centeredState: { alignItems: 'center' as const, justifyContent: 'center' as const },
  loadingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.base },
  retryBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  retryText: { ...typography.body, color: colors.white, fontWeight: '600' as const },
});
