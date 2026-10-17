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
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { useBookingStore } from '@/stores/booking.store';
import { getCategories, getActivePromotions, type Category, type Promotion } from '@/services/catalog.service';
import { getActiveBookings, getRecentBookings } from '@/services/booking.service';
// Phase K MED-K09 fix — fetch saved addresses so the home header
// can display the customer's default saved address instead of the
// generic "Select your address" placeholder. Pre-fix the user could
// have a default Home address saved but the header said nothing
// about it; now the header shows label + city of the default
// address (or first address if none marked default). This is account address
// management, not a booking-location selector; service selection resets the
// booking draft and the exact service location is chosen in the booking flow.
import { getAddresses, type SavedAddress } from '@/services/address.service';
import api from '@/services/api';
// A7 — shared UI kit for the top-level loading + error states.
import { StatusBadge, Skeleton, ErrorState } from '@/components/ui';
import BrandMark, { BRAND_BLUE } from '@/components/BrandMark';
import { formatPHP } from '@/utils/currency';
import { formatRelative } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { getCategoryIcon } from '@/config/category-icons';
import { useResponsive, byBreakpoint } from '@/hooks/useResponsive';
import { useRequestFirstBooking } from '@/hooks/useRequestFirstBooking';
import { useCategoryServiceCounts, withBookableServices } from '@/hooks/useCategoryServiceCounts';
import { DESKTOP_SHELL_MIN_WIDTH, getForcedView } from '@/utils/responsive';
import type { ComponentType } from 'react';
import { buildRoute, Routes } from '@/config/navigation';
import {
  Bell,
  Search,
  MapPin,
  ChevronDown,
  ArrowRight,
  ClipboardEdit,
  Receipt,
  CheckCircle2,
  CalendarDays,
} from '@/components/icons';
import { isTesterFeedbackEnabled } from '@/components/feedback/SendFeedbackLink';
import { FEEDBACK_BUTTON_CLEARANCE } from '@/components/feedback/TesterFeedbackButton';

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

interface HowItWorksStep {
  title: string;
  Icon: IconComponent;
}

// Human audit 2026-10-13 (HA-DISC): a short, factual "How it works" row
// replaces the home TrustStrip and the old 3-tile "How onService works"
// footer. It states only what the app does today: no escrow, guarantee,
// insurance or count claims (legal hold E10/F#10, LAUNCH-LIMITATIONS §23).
// D38 request-first booking (default on): every service starts with a job
// description and a pro sends the price.
const REQUEST_FIRST_STEPS: HowItWorksStep[] = [
  { title: 'Describe the job', Icon: ClipboardEdit },
  { title: 'Get a price from a local pro', Icon: Receipt },
  { title: 'Accept, book and pay in the app', Icon: CheckCircle2 },
];
// Admin switched request-first booking off: the old catalog flow, where some
// services show a set price and others are quoted, is back.
const CATALOG_STEPS: HowItWorksStep[] = [
  { title: 'Choose a service', Icon: ClipboardEdit },
  { title: 'Pick a date, time and address', Icon: CalendarDays },
  { title: 'Pay in the app and track the job', Icon: CheckCircle2 },
];

type GridItem = Category | { id: string; spacer: true };

function isSpacer(item: GridItem): item is { id: string; spacer: true } {
  return (item as { spacer?: boolean }).spacer === true;
}

// Category grid geometry (shared with the styles below).
const GRID_SIDE_PADDING = spacing.base;
const GRID_GAP = spacing.sm;
const TILE_PADDING_X = spacing.xs;
const TILE_BORDER_WIDTH = 1;
// Every tile must fit an 11-letter word such as "Landscaping" or "Maintenance"
// on one line. Measured in Roboto 600 13px they are 74.4px and 75.6px, and
// neither Android nor react-native-web shrinks a single word that wraps; they
// split it mid-word instead ("Landscapin" / "g"). 80px leaves headroom for the
// slightly wider iOS system font.
const MIN_CATEGORY_LABEL_WIDTH = 80;

/** Width left for a tile's label when the phone grid has `columns` columns. */
function categoryLabelWidth(screenWidth: number, columns: number): number {
  const tileWidth = (screenWidth - GRID_SIDE_PADDING * 2 - GRID_GAP * (columns - 1)) / columns;
  return tileWidth - TILE_PADDING_X * 2 - TILE_BORDER_WIDTH * 2;
}

/** 4 columns when the labels fit (416dp and wider), otherwise 3. */
function phoneCategoryColumns(screenWidth: number): number {
  return categoryLabelWidth(screenWidth, 4) >= MIN_CATEGORY_LABEL_WIDTH ? 4 : 3;
}

export default function HomeScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const requestFirst = useRequestFirstBooking();
  // Category grid: 4 columns on phones wide enough for every label (416dp
  // and up), 3 on narrower phones, more on tablet and desktop. Every tile is
  // the same width (see spacer padding).
  const { breakpoint, isPhone, width } = useResponsive();
  const categoryColumns = byBreakpoint(breakpoint, { phone: phoneCategoryColumns(width), tablet: 5, desktop: 6 });
  const setCategory = useBookingStore((s) => s.setCategory);
  // On wide web the desktop frame (WebAppFrame, 1180px and up) already shows
  // the onService brand in its side menu, so the phone wordmark would repeat it.
  const { width: windowWidth } = useWindowDimensions();
  const frameShowsBrand =
    Platform.OS === 'web' && windowWidth >= DESKTOP_SHELL_MIN_WIDTH && getForcedView() !== 'mobile';

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const serviceCountsQuery = useCategoryServiceCounts();

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
    serviceCountsQuery.isRefetching ||
    activeBookingsQuery.isRefetching ||
    recentBookingsQuery.isRefetching ||
    promosQuery.isRefetching ||
    sukiQuery.isRefetching ||
    unreadQuery.isRefetching ||
    addressesQuery.isRefetching;

  const onRefresh = useCallback(() => {
    void categoriesQuery.refetch();
    void serviceCountsQuery.refetch();
    void activeBookingsQuery.refetch();
    void recentBookingsQuery.refetch();
    void promosQuery.refetch();
    void sukiQuery.refetch();
    void unreadQuery.refetch();
    void addressesQuery.refetch();
  }, [categoriesQuery, serviceCountsQuery, activeBookingsQuery, recentBookingsQuery, promosQuery, sukiQuery, unreadQuery, addressesQuery]);

  const handleCategoryPress = (cat: Category): void => {
    setCategory(cat.id, cat.name, cat.slug);
    router.push(buildRoute(Routes.CUSTOMER.CATEGORY, { id: cat.slug }));
  };

  const activeBookings = activeBookingsQuery.data ?? [];
  const recentBookings = recentBookingsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  // Hide only categories we positively know have no active services.
  const visibleCategories = withBookableServices(categories, serviceCountsQuery.data);
  // Nothing to choose from: every category is known to be empty (or the
  // catalog has none). Home says so instead of showing a blank grid.
  const noBookableServices = categoriesQuery.isSuccess && visibleCategories.length === 0;
  // Pad the last grid row with empty cells so every tile keeps the same width.
  const remainder = visibleCategories.length % categoryColumns;
  const gridItems: GridItem[] = remainder === 0
    ? visibleCategories
    : [
      ...visibleCategories,
      ...Array.from({ length: categoryColumns - remainder }, (_, i) => ({ id: `grid-spacer-${i}`, spacer: true as const })),
    ];
  const promotions = promosQuery.data ?? [];
  const sukiProviders = sukiQuery.data ?? [];
  const unreadCount = unreadQuery.data ?? 0;
  const howItWorksSteps = requestFirst ? REQUEST_FIRST_STEPS : CATALOG_STEPS;
  const hasNoBookingsYet =
    activeBookingsQuery.isSuccess &&
    recentBookingsQuery.isSuccess &&
    activeBookings.length === 0 &&
    recentBookings.length === 0;

  const renderHeader = (): React.ReactElement => (
    <View>
      {/* Header bar: brand wordmark on the left, notifications on the right. */}
      <View style={[styles.headerBar, { paddingTop: insets.top + spacing.sm }]}>
        {frameShowsBrand ? (
          <View style={styles.headerSpacer} />
        ) : (
          // Bug UX-1422: the house logo (blue tile, white house) beside the
          // wordmark; "onService" stays short because the bar is narrow.
          <View style={styles.brandRow} testID="home-brand">
            <BrandMark tone="onLight" size={28} testID="home-brand-mark" />
            <Text style={styles.wordmark} accessibilityLabel="onService" testID="home-wordmark">
              onService
            </Text>
          </View>
        )}

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

      {/* Page title. Ken (2026-10-13): the first screen needs a clear name. */}
      <View style={styles.titleBlock}>
        {user?.firstName ? (
          <Text style={styles.greeting}>Welcome back, {user.firstName}</Text>
        ) : null}
        <Text style={styles.pageTitle} accessibilityRole="header">Book a service</Text>
        <Text style={styles.pageSubtitle}>
          {requestFirst
            ? 'Tell us what you need. A local pro sends you a price for your exact job, and you accept it in the app before any work starts.'
            : 'Choose a service, check the details and book it in the app.'}
        </Text>

        <TouchableOpacity
          style={styles.addressChip}
          onPress={() => router.push(Routes.CUSTOMER.ADDRESSES)}
          accessibilityLabel={
            addressesQuery.isError
              ? 'Saved addresses unavailable. Open address management to retry.'
              : headerAddress
                ? `Default address: ${headerAddress.label} in ${headerAddress.city}. Tap to manage addresses.`
                : 'No default address saved. Tap to add an address.'
          }
          accessibilityRole="button"
        >
          <MapPin size={14} color={colors.primary} />
          {/* Phase K MED-K09 fix — show the saved default address instead of a
              generic placeholder. This manages saved addresses; the exact job
              location is still chosen in the booking flow. */}
          <Text style={styles.addressChipText} numberOfLines={1}>
            {addressesQuery.isError
              ? 'Address unavailable'
              : headerAddress
                ? `${headerAddress.label} · ${headerAddress.city}`
                : 'Add an address'}
          </Text>
          <ChevronDown size={14} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Search: asks for the problem in the customer's own words. */}
      <Pressable
        style={styles.searchBar}
        onPress={() => router.push(Routes.CUSTOMER.SEARCH)}
        accessibilityRole="button"
        accessibilityLabel="Describe the problem to find a service"
        testID="home-search-prompt"
      >
        <View style={styles.searchIconWrap}><Search size={18} color={colors.textSecondary} /></View>
        <Text style={styles.searchPlaceholder} numberOfLines={1}>
          Describe the problem, e.g. aircon not cooling
        </Text>
      </Pressable>

      {/* Active Booking Card */}
      {activeBookingsError && (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>Failed to load active bookings.</Text>
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
              <TouchableOpacity onPress={() => router.push(Routes.TABS.BOOKINGS)} accessibilityRole="button" accessibilityLabel="See all active bookings">
                <Text style={styles.seeAllLink}>See all &gt;</Text>
              </TouchableOpacity>
            )}
          </View>
          {activeBookings.slice(0, 3).map((booking) => (
            <TouchableOpacity
              key={booking.id}
              style={styles.activeCard}
              onPress={() => router.push(buildRoute(Routes.CUSTOMER.BOOKING_DETAIL, { id: booking.id }))}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Track ${booking.serviceName ?? booking.categoryName ?? 'service'} booking`}
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
                <ArrowRight size={14} color={colors.primary} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Promo Carousel */}
      {promosError && (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>Failed to load promotions.</Text>
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
                disabled={!item.ctaLink}
                accessibilityRole={item.ctaLink ? 'button' : undefined}
                accessibilityLabel={item.ctaLink ? `${item.ctaText ?? 'Open'}: ${item.title}` : undefined}
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
                    <ArrowRight size={14} color={colors.primary} />
                  </View>
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Category Grid Header */}
      <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]} accessibilityRole="header">
        Choose a service
      </Text>
    </View>
  );

  const renderCategoryItem = ({ item }: { item: GridItem }): React.ReactElement => {
    if (isSpacer(item)) {
      return <View style={styles.categorySpacer} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
    }
    const Icon = getCategoryIcon(item.slug, item.name);
    return (
      <TouchableOpacity
        style={styles.categoryTile}
        onPress={() => handleCategoryPress(item)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Browse ${item.name} services`}
        testID={`category-tile-${item.slug}`}
      >
        <Icon size={28} color={colors.primary} />
        <Text
          style={styles.categoryTileLabel}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderNoBookableServices = (): React.ReactElement => (
    <View style={styles.noServicesCard} testID="home-no-services">
      <Text style={styles.noServicesTitle}>No services are open for booking yet</Text>
      <Text style={styles.noServicesText}>Please check back soon.</Text>
      <TouchableOpacity
        style={styles.noServicesButton}
        onPress={onRefresh}
        accessibilityRole="button"
        accessibilityLabel="Refresh the list of services"
      >
        <Text style={styles.noServicesButtonText}>Refresh</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFooter = (): React.ReactElement => (
    <View>
      {/* How it works: Human audit 2026-10-13 (HA-DISC). Replaces the home */}
      {/* TrustStrip and the old "How onService works" tiles (Bug 889). */}
      {/* Factual steps only: no tap target, no peso amounts, no insurance, */}
      {/* escrow or guarantee claims. */}
      <View
        style={styles.howItWorksSection}
        testID="how-it-works-section"
        accessibilityLabel={`How it works: ${howItWorksSteps.map((step, i) => `${i + 1}. ${step.title}`).join('. ')}.`}
      >
        <Text style={styles.howItWorksTitle}>How it works</Text>
        <View style={styles.howItWorksRow}>
          {howItWorksSteps.map((step, i) => (
            <View key={step.title} style={styles.howItWorksStep}>
              <View style={styles.howItWorksIconWrap}>
                <step.Icon size={20} color={colors.primary} />
              </View>
              <Text style={styles.howItWorksStepNumber}>Step {i + 1}</Text>
              <Text style={styles.howItWorksStepTitle}>{step.title}</Text>
            </View>
          ))}
        </View>
        {hasNoBookingsYet && !noBookableServices && (
          <Text style={styles.noBookingsHint}>
            You have no bookings yet. Choose a service above to get started.
          </Text>
        )}
      </View>

      {/* Suki Providers */}
      {sukiProviders.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Your Suki Pros</Text>
            <TouchableOpacity onPress={() => router.push(Routes.CUSTOMER.SUKI_PROS)} accessibilityRole="button" accessibilityLabel="See all Suki providers">
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
                onPress={() => router.push(buildRoute(Routes.CUSTOMER.PROVIDER_PROFILE, { id: item.providerId }))}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.providerName} provider profile`}
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
                <View style={styles.sukiBookBtn}>
                  <Text style={styles.sukiBookText}>View services</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Quick Re-book */}
      {recentBookingsError && (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>Failed to load recent bookings.</Text>
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
                  // with fresh canonical pricing. A category known to
                  // have no active services opens the old booking instead.
                  const cat = visibleCategories.find((c) => c.id === item.categoryId);
                  if (cat) {
                    setCategory(cat.id, cat.name, cat.slug);
                    router.push(buildRoute(Routes.CUSTOMER.CATEGORY, { id: cat.slug }));
                  } else {
                    router.push(buildRoute(Routes.CUSTOMER.BOOKING_DETAIL, { id: item.id }));
                  }
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Book ${item.serviceName ?? 'service'} again`}
              >
                <Text style={styles.rebookService}>
                  {item.serviceName ?? 'Service'}
                </Text>
                {item.providerName && (
                  <Text style={styles.rebookProvider}>{item.providerName}</Text>
                )}
                {/* What the customer paid last time: a past fact, labelled so it
                    does not read as the price of booking again (a pro prices
                    the new job). */}
                <Text style={styles.rebookPaidLabel}>You paid last time</Text>
                <Text style={styles.rebookPrice}>{formatPHP(item.totalAmount)}</Text>
                <Text style={styles.rebookCta}>Book Again</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      <View style={styles.bottomSpacer} />
    </View>
  );

  if (categoriesQuery.isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.base, paddingHorizontal: spacing.base }]}>
        <Skeleton width="40%" height={22} style={{ marginBottom: spacing.base }} />
        <Skeleton width="60%" height={28} style={{ marginBottom: spacing.sm }} />
        <Skeleton width="100%" height={48} borderRadius={borderRadius.xl} style={{ marginBottom: spacing.lg }} />
        <View style={styles.skeletonGrid}>
          {Array.from({ length: categoryColumns * 2 }).map((_, i) => (
            <Skeleton
              key={String(i)}
              width={`${Math.floor(100 / categoryColumns) - 3}%`}
              height={92}
              borderRadius={borderRadius.xl}
            />
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
    <View
      style={styles.container}
      accessibilityLabel={isPhone ? 'Customer home' : 'Wide customer home workspace'}
    >
    <FlatList
      data={gridItems}
      renderItem={renderCategoryItem}
      keyExtractor={(item) => item.id}
      key={`cats-${categoryColumns}`}
      numColumns={categoryColumns}
      ListHeaderComponent={renderHeader}
      ListEmptyComponent={noBookableServices ? renderNoBookableServices : null}
      ListFooterComponent={renderFooter}
      columnWrapperStyle={styles.categoryRow}
      style={styles.list}
      contentContainerStyle={[styles.listContent, isTesterFeedbackEnabled() && { paddingBottom: FEEDBACK_BUTTON_CLEARANCE }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  list: { flex: 1 },
  listContent: { paddingBottom: 20, width: '100%', maxWidth: 1280, alignSelf: 'center' },

  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surfaceMuted,
  },
  headerSpacer: { flex: 1 },
  // Gap of 25% of the tile between tile and wordmark (brand README lockup).
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // Wordmark on a light background: the fixed brand blue (brand README), not
  // the theme's primary colour.
  wordmark: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
    color: BRAND_BLUE,
    letterSpacing: -0.2,
  },
  titleBlock: { paddingHorizontal: spacing.base, paddingBottom: spacing.md },
  greeting: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: 2 },
  pageTitle: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.2,
  },
  pageSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  addressChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    maxWidth: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.full,
  },
  addressChipText: { ...typography.bodySmall, fontWeight: '600', color: colors.text, flexShrink: 1 },
  notifButton: { padding: spacing.sm, position: 'relative' as const, minWidth: 44, minHeight: 44, justifyContent: 'center' as const, alignItems: 'center' as const },
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

  inlineError: { backgroundColor: colors.errorLight, padding: 12, borderRadius: borderRadius.lg, marginHorizontal: spacing.base, marginBottom: spacing.sm },
  inlineErrorText: { color: colors.error, fontSize: 13, textAlign: 'center' },

  section: { paddingHorizontal: spacing.base, marginBottom: spacing.lg },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.md,
  },
  sectionTitleSpaced: {
    paddingHorizontal: spacing.base,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },

  activeCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  activeCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  activeCardTime: { ...typography.caption, color: colors.textSecondary },
  activeCardService: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  activeCardProvider: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  activeCardCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  trackText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.primary,
  },
  activeProgressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.divider,
    overflow: 'hidden',
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  activeProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.primary,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.base,
    minHeight: 52,
    marginHorizontal: spacing.base,
    marginBottom: spacing.lg,
  },
  searchIconWrap: { marginRight: spacing.sm, alignItems: 'center' as const, justifyContent: 'center' as const },
  searchPlaceholder: { ...typography.body, color: colors.textSecondary, flex: 1 },

  categoryRow: {
    paddingHorizontal: GRID_SIDE_PADDING,
    gap: GRID_GAP,
    marginBottom: spacing.sm,
  },
  // One calm tile style for every category (Ken, 2026-10-13): white on the
  // soft canvas, a solid 1px border, radius 12, brand-blue icon, label below.
  categoryTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 92,
    paddingVertical: spacing.md,
    paddingHorizontal: TILE_PADDING_X,
    backgroundColor: colors.surface,
    borderWidth: TILE_BORDER_WIDTH,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
  },
  categoryTileLabel: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  categorySpacer: { flex: 1 },
  noServicesCard: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    padding: spacing.base,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    alignItems: 'flex-start',
  },
  noServicesTitle: { ...typography.body, fontWeight: '600', color: colors.text },
  noServicesText: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  noServicesButton: {
    marginTop: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.base,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.lg,
  },
  noServicesButtonText: { ...typography.bodySmall, fontWeight: '600', color: colors.primary },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    alignItems: 'center' as const,
  },
  sukiAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: spacing.sm,
  },
  sukiAvatarText: { color: colors.primary, fontWeight: '700' as const, fontSize: 20 },
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
    color: colors.success,
    fontWeight: '600' as const,
    marginBottom: spacing.sm,
  },
  sukiBookBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
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
  rebookPaidLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  rebookPrice: {
    ...typography.priceSmall,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  rebookCta: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },

  promoSection: {
    marginBottom: spacing.base,
  },
  promoList: {
    paddingHorizontal: spacing.base,
    gap: spacing.md,
  },
  // White bordered card with a brand-blue accent edge (no solid-blue block).
  promoCard: {
    width: 280,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    borderRadius: borderRadius.xl,
    padding: spacing.base,
    minHeight: 112,
    justifyContent: 'flex-end' as const,
    overflow: 'hidden' as const,
  },
  promoBadge: {
    alignSelf: 'flex-start' as const,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
  },
  promoBadgeText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700' as const,
    fontSize: 10,
    textTransform: 'uppercase' as const,
  },
  promoTitle: {
    ...typography.body,
    fontWeight: '700' as const,
    color: colors.text,
    marginBottom: 4,
  },
  promoSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  promoCta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    gap: 4,
  },
  promoCtaText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '700' as const,
  },

  // SiguradoShield banner styles removed — Bug 889 (Phase 14 D04 pull).
  // Replaced by howItWorks* below. Do NOT reintroduce shieldBanner* without
  // lifting LAUNCH-LIMITATIONS §23.

  howItWorksSection: {
    marginHorizontal: spacing.base,
    marginTop: spacing.base,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    padding: spacing.base,
  },
  howItWorksTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.md,
  },
  howItWorksRow: { flexDirection: 'row', gap: spacing.sm },
  howItWorksStep: { flex: 1, alignItems: 'flex-start' },
  howItWorksIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: spacing.sm,
  },
  howItWorksStepNumber: { ...typography.caption, color: colors.textSecondary, marginBottom: 2 },
  howItWorksStepTitle: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.text },
  noBookingsHint: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },

  bottomSpacer: { height: 80 },
});
