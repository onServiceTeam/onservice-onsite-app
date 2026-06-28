import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Pressable,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { useBookingStore } from '@/stores/booking.store';
import { getCategories, getActivePromotions, type Category, type Promotion } from '@/services/catalog.service';
import { getActiveBookings, getRecentBookings } from '@/services/booking.service';
// Phase K MED-K09 fix — fetch saved addresses so the home header
// can display the customer's selected location instead of the
// generic "Select your address" placeholder. Pre-fix the user could
// have a default Home address saved but the header said nothing
// about it; now the header shows label + city of the default
// address (or first address if none marked default), and tapping
// it goes to the address picker as before.
import { getAddresses, type SavedAddress } from '@/services/address.service';
import api from '@/services/api';
// A7 — shared UI kit for the top-level loading + error states.
import { StatusBadge, Skeleton, ErrorState, TrustStrip } from '@/components/ui';
import { formatPHP } from '@/utils/currency';
import { formatRelative } from '@/utils/date';
import { colors, spacing, typography, borderRadius, getCategoryTint } from '@/config/theme';
import type { ComponentType } from 'react';
import { Routes } from '@/config/navigation';
import {
  Sparkles,
  Wrench,
  Zap,
  Paintbrush2,
  Snowflake,
  Bug,
  Package,
  Hammer,
  Plug,
  Bell,
  Search,
  Users,
  Lock,
  Home as HomeIcon,
  ChevronDown,
  ArrowRight,
} from '@/components/icons';

type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

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

const CATEGORY_ICONS: Record<string, IconComponent> = {
  cleaning: Sparkles,
  plumbing: Wrench,
  electrical: Zap,
  painting: Paintbrush2,
  aircon: Snowflake,
  'aircon-services': Snowflake,
  pest: Bug,
  'pest-control': Bug,
  moving: Package,
  carpentry: Hammer,
  appliance: Plug,
  'appliance-repair': Plug,
  'general-maintenance': Hammer,
};

// App design refresh — rough completion % per booking status, drives the slim
// progress bar on the home active-booking card. Falls back to 40% for any
// unmapped status.
const STATUS_PROGRESS: Record<string, number> = {
  requested: 12, quoted: 18, payment_pending: 28, matched: 35, paid: 45,
  provider_en_route: 65, provider_arrived: 80, in_progress: 92,
  completed_by_provider: 98, confirmed: 100,
};
function statusProgress(status: string): number {
  return STATUS_PROGRESS[status] ?? 40;
}

// Booking status is rendered via the canonical <StatusBadge/> component, which
// maps each backend status to a friendly, properly-cased label and on-brand
// colors (replaces the old raw ALL-CAPS Badge that showed e.g. "PROVIDER EN
// ROUTE").

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
  const { isError: activeBookingsError } = activeBookingsQuery;

  const recentBookingsQuery = useQuery({
    queryKey: ['recentBookings'],
    queryFn: () => getRecentBookings(3),
    staleTime: 5 * 60 * 1000,
  });
  const { isError: recentBookingsError } = recentBookingsQuery;

  const promosQuery = useQuery({
    queryKey: ['activePromotions'],
    queryFn: getActivePromotions,
    staleTime: 10 * 60 * 1000,
  });
  const { isError: promosError } = promosQuery;

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

  // Phase K MED-K09 fix — fetch saved addresses to populate the
  // location header. Default address wins; falls back to first if
  // no isDefault. 5-min staleTime — addresses don't change often.
  const addressesQuery = useQuery({
    queryKey: ['addresses'],
    queryFn: getAddresses,
    staleTime: 5 * 60 * 1000,
  });
  const headerAddress: SavedAddress | null = (() => {
    const list = addressesQuery.data ?? [];
    if (list.length === 0) return null;
    return list.find((a) => a.isDefault) ?? list[0] ?? null;
  })();

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
          onPress={() => router.push(Routes.TABS.PROFILE)}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.firstName?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.locationSelector}
          onPress={() => router.push(Routes.CUSTOMER.ADDRESS_PICKER)}
          accessibilityLabel={
            headerAddress
              ? `Current location: ${headerAddress.label} in ${headerAddress.city}. Tap to change.`
              : 'No location selected. Tap to add an address.'
          }
        >
          <Text style={styles.locationLabel}>Current Location</Text>
          <View style={styles.locationValueRow}>
            {/* Phase K MED-K09 fix — show selected location instead
                 of generic placeholder. Phase 200 — the dropdown affordance
                 is now a ChevronDown icon, not a ▾ glyph appended to the text. */}
            <Text style={styles.locationValue} numberOfLines={1}>
              {headerAddress
                ? `${headerAddress.label} · ${headerAddress.city}`
                : 'Select your address'}
            </Text>
            <ChevronDown size={14} color={colors.text} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.notifButton}
          onPress={() => router.push(Routes.CUSTOMER.NOTIFICATIONS)}
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        >
          <Bell size={22} color={colors.text} />
          {unreadCount > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Active Booking Card */}
      {activeBookingsError && (
        <View style={{ backgroundColor: colors.errorLight, padding: 12, borderRadius: 10, marginHorizontal: 16, marginBottom: 8 }}>
          <Text style={{ color: colors.error, fontSize: 13, textAlign: 'center' }}>Failed to load active bookings.</Text>
        </View>
      )}
      {activeBookings.length > 0 && (
        <View style={styles.section}>
          {/* BUG-PHASE169-01 fix — pre-fix this section ALWAYS sliced
              to (0, 1), showing only the first active booking. If a
              customer had 2+ active bookings (e.g., a paid booking
              with provider en route AND a matched booking waiting),
              the second was invisible from home. The title was also
              hardcoded singular ("Active Booking"). Now: show up to
              the first 3 with "See all >" link when there are more. */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>
              {activeBookings.length === 1 ? 'Active Booking' : 'Active Bookings'}
            </Text>
            {activeBookings.length > 3 && (
              <TouchableOpacity onPress={() => router.push(Routes.TABS.BOOKINGS)}>
                <Text style={styles.seeAllLink}>See all &gt;</Text>
              </TouchableOpacity>
            )}
          </View>
          {activeBookings.slice(0, 3).map((booking) => (
            <TouchableOpacity
              key={booking.id}
              style={styles.activeCard}
              onPress={() => router.push(`/customer/booking/${booking.id}`)}
              activeOpacity={0.8}
            >
              <View style={styles.activeCardTop}>
                <StatusBadge status={booking.status} />
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
              <View style={styles.activeProgressTrack}>
                <View style={[styles.activeProgressFill, { width: `${statusProgress(booking.status)}%` }]} />
              </View>
              <View style={styles.activeCardCta}>
                <Text style={styles.trackText}>Track Status</Text>
                <ArrowRight size={14} color={colors.white} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Search Bar */}
      <Pressable
        style={styles.searchBar}
        onPress={() => router.push(Routes.CUSTOMER.SEARCH)}
      >
        <View style={styles.searchIconWrap}><Search size={16} color={colors.textTertiary} /></View>
        <Text style={styles.searchPlaceholder}>Search services or providers...</Text>
      </Pressable>

      <TrustStrip style={styles.trustStrip} />

      {/* Promo Carousel */}
      {promosError && (
        <View style={{ backgroundColor: colors.errorLight, padding: 12, borderRadius: 10, marginHorizontal: 16, marginBottom: 8 }}>
          <Text style={{ color: colors.error, fontSize: 13, textAlign: 'center' }}>Failed to load promotions.</Text>
        </View>
      )}
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
                  // BUG-PHASE88-01 fix — pre-fix the ctaLink (admin-managed,
                  // VARCHAR(500) with no format constraint per migration 044)
                  // was passed straight to expo-router's router.push(). For
                  // an internal route like '/customer/category/cleaning' that
                  // works; for an external URL like 'https://onservice.ph/promo'
                  // expo-router fails silently and the customer's tap does
                  // nothing. Ops set ctaLink to either form. Now: route by
                  // shape — internal paths via router, external https/http
                  // via Linking.openURL.
                  const link = item.ctaLink;
                  if (!link) return;
                  if (link.startsWith('/')) {
                    router.push(link);
                  } else if (/^https?:\/\//i.test(link)) {
                    void Linking.openURL(link);
                  }
                  // Anything else (mailto:, tel:, malformed) is ignored.
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
    const Icon = CATEGORY_ICONS[item.slug] ?? CATEGORY_ICONS[(item.name ?? '').toLowerCase()] ?? Hammer;
    const tint = getCategoryTint(item.slug);
    return (
      <TouchableOpacity
        style={[styles.categoryCard, { backgroundColor: tint.bg }]}
        onPress={() => handleCategoryPress(item)}
        activeOpacity={0.8}
      >
        <View style={styles.categoryChip}>
          <Icon size={22} color={tint.fg} />
        </View>
        <Text style={[styles.categoryCardLabel, { color: tint.fg }]} numberOfLines={2}>
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
            <TouchableOpacity onPress={() => router.push(Routes.CUSTOMER.SUKI_PROS)}>
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
                onPress={() => router.push(`/customer/provider/${item.providerId}`)}
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
                  onPress={() => router.push(`/customer/provider/${item.providerId}`)}
                >
                  <Text style={styles.sukiBookText}>Book</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Quick Re-book */}
      {recentBookingsError && (
        <View style={{ backgroundColor: colors.errorLight, padding: 12, borderRadius: 10, marginHorizontal: 16, marginBottom: 8 }}>
          <Text style={{ color: colors.error, fontSize: 13, textAlign: 'center' }}>Failed to load recent bookings.</Text>
        </View>
      )}
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
                  // BUG-PHASE64-01 fix — pre-fix this onPress checked
                  // subcategoryId then pushed to BOOKING_FORM with NO
                  // category/service context, so the form opened in
                  // its zustand-default state showing a blank service
                  // — and if subcategoryId was null nothing happened
                  // at all (silent fail). Now: look up the category
                  // by id from the cached list, set the booking-store
                  // category, and navigate to the category screen so
                  // the user can pick the same subcategory + addons
                  // with fresh canonical pricing.
                  const cat = categories.find((c) => c.id === item.categoryId);
                  if (cat) {
                    setCategory(cat.id, cat.name, cat.slug);
                    router.push(`/customer/category/${cat.slug}`);
                  } else {
                    router.push(`/customer/booking/${item.id}`);
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

      {/* How onService works — Bug 889 (Phase 14 D04 SiguradoShield pull). */}
      {/* Replaces the old SiguradoShield insurance banner with informational */}
      {/* trust claims only. No tap target, no peso amounts, no insurance copy. */}
      <View style={styles.howItWorksSection} testID="how-it-works-section">
        <Text style={styles.howItWorksTitle}>How onService works</Text>
        <View style={styles.howItWorksGrid}>
          <View style={styles.howItWorksTile}>
            <View style={styles.howItWorksIconWrap}><Search size={28} color={colors.primary} /></View>
            <View style={styles.howItWorksTextWrap}>
              <Text style={styles.howItWorksTileTitle}>Pick a service</Text>
              <Text style={styles.howItWorksTileBody}>Browse trusted pros nearby.</Text>
            </View>
          </View>
          <View style={styles.howItWorksTile}>
            <View style={styles.howItWorksIconWrap}><Users size={28} color={colors.primary} /></View>
            <View style={styles.howItWorksTextWrap}>
              <Text style={styles.howItWorksTileTitle}>Get matched</Text>
              <Text style={styles.howItWorksTileBody}>Choose from quotes or book directly.</Text>
            </View>
          </View>
          <View style={styles.howItWorksTile}>
            <View style={styles.howItWorksIconWrap}><Lock size={28} color={colors.primary} /></View>
            <View style={styles.howItWorksTextWrap}>
              <Text style={styles.howItWorksTileTitle}>Pay safely</Text>
              <Text style={styles.howItWorksTileBody}>Payment held in escrow until you confirm.</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Empty state for new users */}
      {activeBookings.length === 0 && recentBookings.length === 0 && (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}><HomeIcon size={48} color={colors.textSecondary} /></View>
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
      <View style={[styles.container, { paddingTop: insets.top + spacing.base, paddingHorizontal: spacing.base }]}>
        <Skeleton width="55%" height={26} style={{ marginBottom: spacing.base }} />
        <Skeleton width="100%" height={110} borderRadius={borderRadius.lg} style={{ marginBottom: spacing.lg }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={String(i)} width={70} height={84} borderRadius={borderRadius.md} />
          ))}
        </View>
      </View>
    );
  }

  if (categoriesQuery.isError && categories.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ErrorState
          title="Could not load services"
          message="Please check your connection and try again."
          onRetry={onRefresh}
        />
      </View>
    );
  }

  return (
    <FlatList
      data={categories}
      renderItem={renderCategoryItem}
      keyExtractor={(item) => item.id}
      numColumns={2}
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
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  listContent: { paddingBottom: 20 },

  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
    backgroundColor: colors.surfaceMuted,
  },
  trustStrip: { marginHorizontal: spacing.base, marginBottom: spacing.base },
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
  locationValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationValue: { ...typography.bodySmall, fontWeight: '600', color: colors.text, flexShrink: 1 },
  notifButton: { padding: spacing.sm, position: 'relative' as const, minWidth: 44, minHeight: 44, justifyContent: 'center' as const, alignItems: 'center' as const },
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
  activeCardCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  trackText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.white,
  },
  activeProgressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  activeProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.secondary,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  searchIcon: { fontSize: 16, marginRight: spacing.sm },
  searchIconWrap: { marginRight: spacing.sm, alignItems: 'center' as const, justifyContent: 'center' as const },
  searchPlaceholder: { ...typography.body, color: colors.textTertiary },

  categoryRow: {
    paddingHorizontal: spacing.base,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  categoryCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    minHeight: 64,
  },
  categoryChip: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryCardLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    flex: 1,
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
    minHeight: 44,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
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
  emptyIconWrap: { marginBottom: spacing.base, alignItems: 'center' as const },
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

  // SiguradoShield banner styles removed — Bug 889 (Phase 14 D04 pull).
  // Replaced by howItWorks* below. Do NOT reintroduce shieldBanner* without
  // lifting LAUNCH-LIMITATIONS §23.

  howItWorksSection: {
    marginHorizontal: spacing.base,
    marginTop: spacing.lg,
  },
  howItWorksTitle: {
    ...typography.h2,
    color: colors.text,
    fontSize: 19,
    marginBottom: spacing.md,
  },
  howItWorksGrid: {
    gap: spacing.sm,
  },
  howItWorksTile: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  howItWorksIconWrap: { marginRight: spacing.md, width: 32, alignItems: 'center' as const },
  howItWorksTextWrap: { flex: 1 },
  howItWorksTileTitle: { ...typography.body, fontWeight: '600', color: colors.text, marginBottom: 2 },
  howItWorksTileBody: { ...typography.bodySmall, color: colors.textSecondary },

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
