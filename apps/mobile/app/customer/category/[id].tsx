import React, { useCallback, useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getSubcategories, type Subcategory } from '@/services/catalog.service';
import { useBookingStore } from '@/stores/booking.store';
import { formatPHP } from '@/utils/currency';
import { colors, spacing, typography, borderRadius, getCategoryTint } from '@/config/theme';
import { getCategoryIcon } from '@/config/category-icons';
import { useResponsive, byBreakpoint } from '@/hooks/useResponsive';
import { useRequestFirstBooking } from '@/hooks/useRequestFirstBooking';
import { Clock, ChevronLeft, ChevronRight, ShieldCheck, Wrench } from '@/components/icons';
// A7 — shared UI kit for loading/empty/error states.
import { SkeletonCard, EmptyState, ErrorState } from '@/components/ui';
import { ConfirmModal } from '@/components/ConfirmModal';
import { getServiceScopeCopy } from '@/utils/serviceScope';

import { Routes } from '@/config/navigation';
export default function SubcategoryListScreen(): React.ReactElement {
  const { id: slug } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { draft, setCategory, setSubcategory } = useBookingStore();
  const [selectedSubcategory, setSelectedSubcategory] = useState<Subcategory | null>(null);
  // D38 (Ken, 2026-10-13): no set prices. While the admin setting
  // `request_first_booking` is on (the default), every service opens the
  // describe-your-job request. Off restores the old catalog flow below
  // (prices, scope notice, detail dialog, configure) unchanged.
  const requestFirst = useRequestFirstBooking();

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['subcategories', slug],
    queryFn: () => getSubcategories(slug),
    staleTime: 24 * 60 * 60 * 1000,
    enabled: !!slug,
  });
  const subcategories = data?.subcategories;
  const categoryName = data?.categoryName ?? draft.categoryName ?? 'Services';

  const onRefresh = useCallback(() => { refetch(); }, [refetch]);

  // The catalog/serializer value is 'quote' (DB CHECK in migration 003), not
  // 'quote_based' (that is the bookings.booking_type value). The old check
  // compared against 'quote_based' and only worked via the basePrice==null
  // fallback, so a quote subcategory with a base_price set mis-routed to the
  // fixed-price configure screen. Match the real value.
  // D27 Phase 4 — per_unit services route through the quote flow too (the
  // provider measures and confirms; the rate is only an estimate). D27 Phase 4b
  // — hourly is NOT quote-based: it books fixed-price with an estimate via the
  // configure flow, so it must be excluded even though base_price is null.
  const isHourly = (sub: Subcategory): boolean => sub.pricingType === 'hourly';
  const isQuoteBased = (sub: Subcategory): boolean =>
    !isHourly(sub) && (sub.pricingType === 'quote' || sub.pricingType === 'per_unit' || sub.basePrice == null);

  const applyCategory = (sub: Subcategory): void => {
    if (sub.categoryId) {
      setCategory(
        sub.categoryId,
        sub.categoryName ?? data?.categoryName ?? draft.categoryName ?? '',
        sub.categorySlug ?? slug ?? draft.categorySlug ?? '',
      );
    }
  };

  // Request-first: the same booking-draft values and route the quote path has
  // always used, for every pricing type. No price is carried (basePrice 0);
  // the provider's quote sets it on the server when the customer accepts.
  const startJobRequest = (sub: Subcategory): void => {
    applyCategory(sub);
    setSubcategory(sub.id, sub.name, 0, { description: sub.description, pricingType: sub.pricingType });
    router.push(Routes.CUSTOMER.BOOKING_JOB_REQUEST);
  };

  const handleSelect = (sub: Subcategory): void => {
    // Close the native/web modal before changing routes. Expo keeps previous
    // stack screens mounted, so closing after router.push can leave the old
    // dialog in the browser accessibility tree over later booking steps.
    setSelectedSubcategory(null);
    applyCategory(sub);
    if (isQuoteBased(sub)) {
      setSubcategory(sub.id, sub.name, 0, { description: sub.description, pricingType: sub.pricingType });
      router.push(Routes.CUSTOMER.BOOKING_JOB_REQUEST);
    } else if (isHourly(sub)) {
      setSubcategory(sub.id, sub.name, 0, {
        hourlyRate: sub.hourlyRate ?? 0,
        description: sub.description,
        pricingType: sub.pricingType,
      });
      router.push(Routes.CUSTOMER.BOOKING_CONFIGURE);
    } else {
      setSubcategory(sub.id, sub.name, sub.basePrice ?? 0, {
        description: sub.description,
        pricingType: sub.pricingType,
      });
      router.push(Routes.CUSTOMER.BOOKING_CONFIGURE);
    }
  };

  const tint = getCategoryTint(slug);
  const CategoryIcon = getCategoryIcon(slug, data?.categoryName ?? draft.categoryName);

  const { breakpoint } = useResponsive();
  const numColumns = byBreakpoint(breakpoint, { phone: 1, tablet: 2, desktop: 2 });

  const renderRequestFirstItem = (item: Subcategory): React.ReactElement => {
    const description = item.description?.trim() ?? '';
    return (
      <TouchableOpacity
        style={[styles.card, styles.cardCentered, numColumns > 1 && styles.cardGrid]}
        onPress={() => startJobRequest(item)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Choose ${item.name} and describe your job`}
        testID={`service-row-${item.id}`}
      >
        <View style={styles.cardContent}>
          <Text style={styles.serviceName}>{item.name}</Text>
          {description ? (
            <Text style={styles.serviceDescOneLine} numberOfLines={1}>{description}</Text>
          ) : null}
        </View>
        <ChevronRight size={20} color={colors.textTertiary} />
      </TouchableOpacity>
    );
  };

  const renderCatalogItem = (item: Subcategory): React.ReactElement => {
    const quoteBased = isQuoteBased(item);
    const scope = getServiceScopeCopy(item.description, item.pricingType);
    return (
      <TouchableOpacity
        style={[styles.card, numColumns > 1 && styles.cardGrid]}
        onPress={() => setSelectedSubcategory(item)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`View ${item.name} service details`}
        testID={`service-row-${item.id}`}
      >
        <View style={styles.cardContent}>
          <Text style={styles.serviceName}>{item.name}</Text>
          {!scope.isPublished ? <Text style={styles.pendingLabel}>SCOPE DETAILS PENDING</Text> : null}
          <Text style={styles.serviceDesc} numberOfLines={3}>
            {scope.text}
          </Text>
          {item.estimatedDurationMinutes != null && (
            <View style={[styles.durationRow, { backgroundColor: tint.bg }]}>
              <Clock size={12} color={tint.fg} />
              <Text style={[styles.duration, { color: tint.fg }]}>{item.estimatedDurationMinutes} min</Text>
            </View>
          )}
        </View>
        <View style={styles.priceContainer}>
          {item.pricingType === 'hourly' && item.hourlyRate != null ? (
            // D27 Phase 4b — hourly rate; billed for actual time worked.
            <>
              <Text style={styles.price}>{formatPHP(item.hourlyRate)}</Text>
              <Text style={styles.priceLabel}>per hour</Text>
            </>
          ) : item.pricingType === 'per_unit' && item.unitPrice != null ? (
            // D27 Phase 4 — show the per-unit rate; the final price is quoted.
            <>
              <Text style={styles.price}>{formatPHP(item.unitPrice)}</Text>
              <Text style={styles.priceLabel}>per {item.unitLabel ?? 'unit'}</Text>
            </>
          ) : quoteBased ? (
            <Text style={styles.quoteLabel}>Get Quote</Text>
          ) : (
            <>
              <Text style={styles.priceLabel}>Starting at</Text>
              <Text style={styles.price}>{formatPHP(item.basePrice ?? 0)}</Text>
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item }: { item: Subcategory }): React.ReactElement =>
    requestFirst ? renderRequestFirstItem(item) : renderCatalogItem(item);

  const renderListHeader = (): React.ReactElement => (
    <View style={styles.intro}>
      <View style={styles.introRow}>
        <View style={styles.categoryChip}>
          <CategoryIcon size={24} color={colors.primary} />
        </View>
        <Text style={styles.introText} accessibilityRole="header">Choose the service you need</Text>
      </View>
      {requestFirst ? (
        <View
          style={styles.pricingBox}
          testID="how-pricing-works"
          accessibilityLabel="How pricing works"
        >
          <View style={styles.pricingBoxHeader}>
            <ShieldCheck size={20} color={colors.primary} />
            <Text style={styles.pricingBoxTitle}>How pricing works</Text>
          </View>
          <Text style={styles.pricingBoxBody}>
            No set prices. Every job is different, so a pro prices your exact job after seeing your
            details. You accept the price in the app before any work starts. Pay only through onService.
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (!slug) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back from services">
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Services</Text>
        </View>
        <ErrorState
          title="Category unavailable"
          message="This link does not identify a service category. Return to Home and choose the category again."
          onRetry={() => router.push(Routes.TABS.HOME)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back from services">
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">{categoryName}</Text>
      </View>

      {isLoading ? (
        <View style={styles.list}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : error ? (
        <ErrorState
          message="We couldn't load these services. Please check your connection and try again."
          onRetry={onRefresh}
        />
      ) : (
        <View
          style={styles.listWorkspace}
          accessibilityLabel={numColumns > 1 ? 'Tablet and desktop service catalog' : 'Service catalog'}
        >
        <FlatList
          data={subcategories}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          key={`subcats-${numColumns}-${requestFirst ? 'request' : 'catalog'}`}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? styles.gridRow : undefined}
          contentContainerStyle={[styles.list, numColumns > 1 && styles.listWide]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={subcategories && subcategories.length > 0 ? renderListHeader : null}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          // BUG-PHASE184-01 — the empty state has a clear way back so a
          // customer on a freshly-onboarded market is never stuck. Human
          // audit 2026-10-13 (HA-DISC): 4 of 10 live categories have no
          // services yet; the copy now says so plainly.
          ListEmptyComponent={
            <EmptyState
              icon={<Wrench size={48} color={colors.textTertiary} />}
              title="No services yet"
              description="No services are listed in this category right now. Go back and choose another service."
              actionLabel="Back to services"
              onAction={() => router.push(Routes.TABS.HOME)}
            />
          }
        />
        </View>
      )}

      {!requestFirst ? (
        <ConfirmModal
          visible={selectedSubcategory !== null}
          title={selectedSubcategory?.name ?? 'Service details'}
          message={selectedSubcategory
            ? getServiceScopeCopy(selectedSubcategory.description, selectedSubcategory.pricingType).text
            : undefined}
          confirmLabel={selectedSubcategory && isQuoteBased(selectedSubcategory) ? 'Describe job' : 'Customize service'}
          cancelLabel="Back"
          onCancel={() => setSelectedSubcategory(null)}
          onConfirm={() => { if (selectedSubcategory) handleSelect(selectedSubcategory); }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  title: { ...typography.h3, color: colors.text, flex: 1 },
  list: { padding: spacing.base },
  listWorkspace: { flex: 1 },
  listWide: { width: '100%', maxWidth: 1120, alignSelf: 'center', padding: spacing.xl },
  gridRow: { gap: spacing.md },
  cardGrid: { flex: 1 },

  intro: { marginBottom: spacing.base },
  introRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.base },
  categoryChip: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introText: { ...typography.body, fontWeight: '600', color: colors.text, flex: 1 },
  pricingBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    borderRadius: borderRadius.xl,
    padding: spacing.base,
  },
  pricingBoxHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  pricingBoxTitle: { ...typography.body, fontWeight: '700', color: colors.text },
  pricingBoxBody: { ...typography.bodySmall, color: colors.textSecondary },

  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  cardCentered: { alignItems: 'center', minHeight: 64 },
  cardContent: { flex: 1, marginRight: spacing.base },
  serviceName: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: colors.text },
  serviceDescOneLine: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  pendingLabel: { ...typography.caption, color: colors.warningDark, fontWeight: '700', marginTop: spacing.xs, marginBottom: spacing.xs },
  serviceDesc: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.sm },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  duration: { ...typography.caption, color: colors.textTertiary },
  priceContainer: { alignItems: 'flex-end', justifyContent: 'center' },
  priceLabel: { ...typography.caption, color: colors.textTertiary, marginBottom: 2 },
  price: { ...typography.priceSmall, color: colors.primary },
  quoteLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.secondary },
});
