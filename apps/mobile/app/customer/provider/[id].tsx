import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  RefreshControl,
  type DimensionValue,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getProviderProfile, type ProviderService } from '@/services/provider.service';
import { getProviderReviews } from '@/services/review.service';
import { getMemberships } from '@/services/suki.service';
import { useBookingStore } from '@/stores/booking.store';
import { Routes } from '@/config/navigation';
import { useResponsive } from '@/hooks/useResponsive';
// A7 — shared UI kit for loading/empty/error states.
import { Badge, Skeleton, SkeletonCard, EmptyState, ErrorState } from '@/components/ui';
// Phase 14 R5-complete — Avatar with initials fallback in provider header.
import Avatar from '@/components/Avatar';
import { formatPHP } from '@/utils/currency';
import { formatDate } from '@/utils/date';
import { getServiceScopeCopy } from '@/utils/serviceScope';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import {
  Star,
  Wrench,
  CheckCircle2,
  MapPin,
  Heart,
  Building,
  ScrollText,
  ChevronRight,
  Search,
} from '@/components/icons';
// BUG-PHASE94-01 — founding tier added so customers viewing a
// founding-batch provider see the right badge color + label.
const TIER_COLORS: Record<string, string> = {
  founding: colors.tierFounding,
  new: colors.tierNew,
  verified: colors.tierVerified,
  pro: colors.tierPro,
  elite: colors.tierElite,
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TIER_LABELS: Record<string, string> = {
  founding: 'Founding Provider',
  new: 'New Provider',
  verified: 'Verified',
  pro: 'Pro Provider',
  elite: 'Elite Provider',
};

function StarDisplay({ rating }: { rating: number | null }): React.ReactElement {
  if (rating == null) return <Text style={styles.statValue}>New</Text>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Star size={14} color={colors.warning} />
      <Text style={styles.statValue}>{rating.toFixed(1)}</Text>
    </View>
  );
}

function RatingBar({
  label,
  value,
}: {
  label: string;
  value: number | null;
}): React.ReactElement | null {
  if (value == null) return null;
  const pct = Math.min(100, (value / 5) * 100);
  return (
    <View style={styles.ratingBarRow}>
      <Text style={styles.ratingBarLabel}>{label}</Text>
      <View style={styles.ratingBarTrack}>
        <View style={[styles.ratingBarFill, { width: `${pct}%` as DimensionValue }]} />
      </View>
      <Text style={styles.ratingBarValue}>{value.toFixed(1)}</Text>
    </View>
  );
}

function formatResponseTime(minutes: number | null): string {
  if (minutes == null) return 'N/A';
  if (minutes < 60) return `~${minutes} min`;
  const hrs = Math.round(minutes / 60);
  return hrs === 1 ? '~1 hour' : `~${hrs} hours`;
}

export default function ProviderProfileScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();
  const { setCategory, setSubcategory } = useBookingStore();

  // D29 — this seeds only the selected service. It does not reserve or assign
  // the viewed provider. The UI must remain explicit about that until the
  // preferred-provider offer decision is approved and implemented end to end.
  const bookService = useCallback(
    (svc: ProviderService): void => {
      if (svc.categoryId) {
        setCategory(svc.categoryId, svc.categoryName ?? '', svc.categorySlug ?? '');
      }
      const isHourly = svc.pricingType === 'hourly';
      const isQuoteBased =
        !isHourly &&
        (svc.pricingType === 'quote' || svc.pricingType === 'per_unit' || svc.basePrice == null);
      if (isQuoteBased) {
        setSubcategory(svc.subcategoryId, svc.subcategoryName, 0, {
          description: svc.description,
          pricingType: svc.pricingType,
        });
        router.push(Routes.CUSTOMER.BOOKING_JOB_REQUEST);
      } else if (isHourly) {
        setSubcategory(svc.subcategoryId, svc.subcategoryName, 0, {
          hourlyRate: svc.hourlyRate ?? 0,
          description: svc.description,
          pricingType: svc.pricingType,
        });
        router.push(Routes.CUSTOMER.BOOKING_CONFIGURE);
      } else {
        setSubcategory(svc.subcategoryId, svc.subcategoryName, svc.basePrice ?? 0, {
          description: svc.description,
          pricingType: svc.pricingType,
        });
        router.push(Routes.CUSTOMER.BOOKING_CONFIGURE);
      }
    },
    [router, setCategory, setSubcategory],
  );

  const {
    data: provider,
    isLoading: providerLoading,
    isError: providerError,
    refetch: refetchProvider,
    isRefetching: providerRefetching,
  } = useQuery({
    queryKey: ['provider', id],
    queryFn: () => getProviderProfile(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: reviewsData,
    isLoading: reviewsLoading,
    isError: reviewsError,
    refetch: refetchReviews,
    isRefetching: reviewsRefetching,
  } = useQuery({
    queryKey: ['providerReviews', id],
    queryFn: () => getProviderReviews(id, 1, 10),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  const membershipsQuery = useQuery({
    queryKey: ['sukiMemberships'],
    queryFn: getMemberships,
    staleTime: 5 * 60 * 1000,
  });

  const onRefresh = useCallback(() => {
    void refetchProvider();
    void refetchReviews();
    void membershipsQuery.refetch();
  }, [membershipsQuery, refetchProvider, refetchReviews]);

  const reviews = reviewsData?.reviews ?? [];
  const aggregate = reviewsData?.aggregate;
  const membership = membershipsQuery.data?.find((item) => item.providerId === id);
  const availableSchedule = provider?.schedule.filter((slot) => slot.isAvailable) ?? [];

  if (providerLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Provider Profile</Text>
        </View>
        <View style={{ padding: spacing.base }}>
          <Skeleton
            width="100%"
            height={120}
            borderRadius={borderRadius.lg}
            style={{ marginBottom: spacing.base }}
          />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  if (providerError) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Provider Profile</Text>
        </View>
        <ErrorState
          message="We couldn't load this provider profile. Please check your connection and try again."
          onRetry={() => void refetchProvider()}
        />
      </View>
    );
  }

  if (!provider) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Provider Profile</Text>
        </View>
        <EmptyState
          icon={<Search size={48} color={colors.textTertiary} />}
          title="Provider not found"
          description="This provider may no longer be available."
          actionLabel="Go Back"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Provider Profile</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, !isPhone && styles.scrollContentWide]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={providerRefetching || reviewsRefetching}
            onRefresh={onRefresh}
          />
        }
      >
        <View
          style={[styles.workspace, !isPhone && styles.workspaceWide]}
          accessibilityLabel={
            !isPhone ? 'Tablet and desktop customer provider workspace' : undefined
          }
        >
          <View style={[styles.workspaceRail, !isPhone && styles.workspaceRailWide]}>
            <View style={[styles.profileCard, styles.profileCardSurface]}>
              {/* Phase 14 R5-complete — Avatar with initials fallback */}
              <Avatar name={provider.name ?? undefined} size={96} />
              {provider.name && <Text style={styles.providerNameText}>{provider.name}</Text>}
              <View style={styles.tierRow}>
                <Badge
                  label={TIER_LABELS[provider.tier] ?? provider.tier}
                  backgroundColor={TIER_COLORS[provider.tier] ?? colors.textTertiary}
                  size="md"
                />
              </View>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <StarDisplay rating={provider.rating} />
                  <Text style={styles.statLabel}>Rating</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{provider.totalJobs}</Text>
                  <Text style={styles.statLabel}>Jobs</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>
                    {formatResponseTime(provider.responseTimeMinutes)}
                  </Text>
                  <Text style={styles.statLabel}>Responds</Text>
                </View>
              </View>
              <View style={styles.badgeRow}>
                {provider.yearsExperience != null && (
                  <View style={styles.infoBadge}>
                    <Wrench size={12} color={colors.text} />
                    <Text style={styles.infoBadgeText}> {provider.yearsExperience}+ yrs exp</Text>
                  </View>
                )}
                {provider.acceptanceRate != null && provider.acceptanceRate >= 80 && (
                  <View style={styles.infoBadge}>
                    <CheckCircle2 size={12} color={colors.success} />
                    <Text style={styles.infoBadgeText}>
                      {' '}
                      {Math.round(provider.acceptanceRate)}% accept
                    </Text>
                  </View>
                )}
                {provider.serviceRadiusKm != null && (
                  <View style={styles.infoBadge}>
                    <MapPin size={12} color={colors.text} />
                    <Text style={styles.infoBadgeText}> {provider.serviceRadiusKm} km radius</Text>
                  </View>
                )}
                {provider.sukiCount > 0 && (
                  <View style={styles.infoBadge}>
                    <Heart size={12} color={colors.success} />
                    <Text style={styles.infoBadgeText}>
                      {' '}
                      {provider.sukiCount} Suki{provider.sukiCount !== 1 ? 's' : ''}
                    </Text>
                  </View>
                )}
                {provider.city && (
                  <View style={styles.infoBadge}>
                    <Building size={12} color={colors.text} />
                    <Text style={styles.infoBadgeText}>
                      {' '}
                      {provider.city}
                      {provider.province ? `, ${provider.province}` : ''}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {membership && (
              <View
                style={[styles.section, styles.sectionCard]}
                accessibilityLabel="Your Suki relationship with this provider"
              >
                <View style={styles.relationshipHeading}>
                  <Heart size={18} color={colors.primary} />
                  <Text style={styles.sectionTitleCompact}>Your Suki relationship</Text>
                </View>
                <Text style={styles.relationshipTier}>{membership.tier.replaceAll('_', ' ')}</Text>
                <Text style={styles.relationshipCopy}>
                  {membership.totalBookings} completed booking
                  {membership.totalBookings === 1 ? '' : 's'} · {membership.pointsBalance} points
                </Text>
                <Text style={styles.relationshipNotice}>
                  View this provider's services below. Provider assignment is confirmed later in the
                  booking process.
                </Text>
              </View>
            )}

            <View style={[styles.section, styles.sectionCard]}>
              <Text style={styles.sectionTitle}>Availability</Text>
              {availableSchedule.length > 0 ? (
                <View style={styles.scheduleGrid}>
                  {availableSchedule.map((slot) => (
                    <View key={slot.id} style={styles.scheduleItem}>
                      <Text style={styles.scheduleDay}>{DAY_NAMES[slot.dayOfWeek]}</Text>
                      <Text style={styles.scheduleTime}>
                        {slot.startTime} – {slot.endTime}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.sectionEmptyText}>
                  No regular availability has been published. You can still review services, but a
                  booking is not confirmed until availability is checked.
                </Text>
              )}
            </View>
          </View>

          <View style={styles.workspaceMain}>
            {provider.bio && (
              <View style={[styles.section, styles.sectionCard]}>
                <Text style={styles.sectionTitle}>About</Text>
                <Text style={styles.bioText}>{provider.bio}</Text>
              </View>
            )}

            {provider.services.length > 0 ? (
              <View style={[styles.section, styles.sectionCard]}>
                <Text style={styles.sectionTitle}>Services Offered</Text>
                <Text style={styles.sectionHint}>
                  Choose a service to start booking. onService confirms provider assignment after
                  the request details and availability are checked.
                </Text>
                {provider.services.map((svc) => (
                  <TouchableOpacity
                    key={svc.id}
                    style={styles.serviceRow}
                    onPress={() => bookService(svc)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Start ${svc.subcategoryName} booking; provider assignment confirmed later`}
                  >
                    <View style={styles.serviceCopy}>
                      <Text style={styles.serviceName}>{svc.subcategoryName}</Text>
                      <Text style={styles.serviceDescription} numberOfLines={2}>
                        {getServiceScopeCopy(svc.description, svc.pricingType).text}
                      </Text>
                    </View>
                    <View style={styles.serviceRowRight}>
                      {svc.pricingType === 'quote' ? (
                        <Text style={styles.serviceQuote}>Get Quote</Text>
                      ) : svc.pricingType === 'hourly' && svc.hourlyRate != null ? (
                        <Text style={styles.servicePrice}>{formatPHP(svc.hourlyRate)}/hr</Text>
                      ) : svc.pricingType === 'per_unit' && svc.unitPrice != null ? (
                        <Text style={styles.servicePrice}>
                          {formatPHP(svc.unitPrice)}/{svc.unitLabel ?? 'unit'}
                        </Text>
                      ) : svc.basePrice != null ? (
                        <Text style={styles.servicePrice}>{formatPHP(svc.basePrice)}</Text>
                      ) : (
                        <Text style={styles.serviceQuote}>Get Quote</Text>
                      )}
                      <ChevronRight size={18} color={colors.textTertiary} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View
                style={[styles.section, styles.sectionCard]}
                accessibilityLabel="Provider services empty state"
              >
                <Text style={styles.sectionTitle}>Services Offered</Text>
                <Text style={styles.sectionEmptyText}>
                  This provider has no customer-bookable services published right now.
                </Text>
              </View>
            )}

            {provider.portfolio.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Portfolio</Text>
                {isPhone ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.portfolioScroll}
                  >
                    {provider.portfolio.map((item) => (
                      <View key={item.id} style={styles.portfolioCard}>
                        <Image
                          source={{ uri: item.imageUrl }}
                          style={styles.portfolioImage}
                          resizeMode="cover"
                        />
                        {item.caption ? (
                          <Text style={styles.portfolioCaption} numberOfLines={2}>
                            {item.caption}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </ScrollView>
                ) : (
                  <View style={styles.portfolioGrid} accessibilityLabel="Provider portfolio grid">
                    {provider.portfolio.map((item) => (
                      <View key={item.id} style={styles.portfolioCardWide}>
                        <Image
                          source={{ uri: item.imageUrl }}
                          style={styles.portfolioImageWide}
                          resizeMode="cover"
                        />
                        {item.caption ? (
                          <Text style={styles.portfolioCaption} numberOfLines={2}>
                            {item.caption}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {provider.certifications.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Certifications</Text>
                {provider.certifications.map((cert) => (
                  <View key={cert.id} style={styles.certRow}>
                    <View style={styles.certIcon}>
                      {cert.isVerified ? (
                        <CheckCircle2 size={18} color={colors.success} />
                      ) : (
                        <ScrollText size={18} color={colors.textSecondary} />
                      )}
                    </View>
                    <View style={styles.certInfo}>
                      <Text style={styles.certName}>{cert.name}</Text>
                      <Text style={styles.certIssuer}>{cert.issuingBody}</Text>
                      {cert.expiryDate && (
                        <Text style={styles.certExpiry}>
                          Valid until {formatDate(cert.expiryDate)}
                        </Text>
                      )}
                    </View>
                    {cert.isVerified && (
                      <View style={styles.certVerifiedBadge}>
                        <Text style={styles.certVerifiedText}>Verified</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {reviewsLoading && (
              <View
                style={[styles.section, styles.sectionCard]}
                accessibilityLabel="Provider reviews loading state"
              >
                <Text style={styles.sectionTitle}>Reviews</Text>
                <SkeletonCard />
              </View>
            )}

            {reviewsError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>Failed to load reviews. Pull to refresh.</Text>
              </View>
            )}

            {aggregate && (
              <View style={[styles.section, styles.sectionCard]}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Reviews</Text>
                  <Text style={styles.reviewCount}>{aggregate.totalReviews} reviews</Text>
                </View>

                {aggregate.overall != null && (
                  <View style={styles.ratingOverview}>
                    <Text style={styles.ratingBig}>{aggregate.overall.toFixed(1)}</Text>
                    <Text style={styles.ratingOutOf}>/ 5</Text>
                  </View>
                )}

                <View style={styles.ratingBreakdown}>
                  <RatingBar label="Quality" value={aggregate.quality} />
                  <RatingBar label="Punctuality" value={aggregate.punctuality} />
                  <RatingBar label="Professionalism" value={aggregate.professionalism} />
                  <RatingBar label="Communication" value={aggregate.communication} />
                  <RatingBar label="Value" value={aggregate.value} />
                </View>
              </View>
            )}

            {reviews.map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <StarDisplay rating={review.rating} />
                  <Text style={styles.reviewDate}>{formatDate(review.createdAt)}</Text>
                </View>
                {review.comment && <Text style={styles.reviewComment}>{review.comment}</Text>}
                {review.providerResponse && (
                  <View style={styles.responseCard}>
                    <Text style={styles.responseLabel}>Provider response:</Text>
                    <Text style={styles.responseText}>{review.providerResponse}</Text>
                  </View>
                )}
              </View>
            ))}

            {!reviewsLoading && !reviewsError && !aggregate && reviews.length === 0 && (
              <View
                style={[styles.section, styles.sectionCard]}
                accessibilityLabel="Provider reviews empty state"
              >
                <Text style={styles.sectionTitle}>Reviews</Text>
                <Text style={styles.sectionEmptyText}>
                  No customer reviews have been published for this provider yet.
                </Text>
              </View>
            )}

            {/* Bug 834 — Phase 14 D04 SiguradoShield pull. The shield-badge that */}
            {/* tappable-linked to the safety screen with "SiguradoShield™ */}
            {/* protection" copy is removed. Trust claims (NBI clearance, escrow, */}
            {/* tracking) are conveyed elsewhere; this provider detail no longer */}
            {/* makes platform-protection promises. Do NOT reintroduce without */}
            {/* lifting LAUNCH-LIMITATIONS §23. */}
          </View>
        </View>
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  centered: { alignItems: 'center', justifyContent: 'center' },
  errorText: { ...typography.body, color: colors.error, marginBottom: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: {
    padding: spacing.sm,
    marginRight: spacing.sm,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center' as const,
  },
  backIcon: { fontSize: 24, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base },
  scrollContentWide: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: spacing.lg },
  workspace: { width: '100%' },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  workspaceRail: { width: '100%' },
  workspaceRailWide: { width: 340, flexShrink: 0 },
  workspaceMain: { flex: 1, minWidth: 0 },

  profileCard: { alignItems: 'center', marginBottom: spacing.xl },
  profileCardSurface: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarLargeText: { color: colors.white, fontWeight: '800', fontSize: 32 },
  providerNameText: {
    ...typography.h2,
    color: colors.text,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  tierLabel: { ...typography.bodySmall, color: colors.textSecondary },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    width: '100%',
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { ...typography.h3, color: colors.text },
  statLabel: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: colors.divider },

  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    width: '100%',
  },
  infoBadge: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  infoBadgeText: { ...typography.caption, color: colors.textSecondary },

  section: { marginBottom: spacing.xl },
  // App design refresh (2026-06) — titled sections sit in a white card that
  // lifts off the soft canvas. Applied to sections whose body is not already
  // made of its own per-row cards (About, Services, Availability).
  sectionCard: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
  },
  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },
  sectionTitleCompact: { ...typography.h3, color: colors.text },
  sectionHint: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionEmptyText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewCount: { ...typography.bodySmall, color: colors.textTertiary },

  bioText: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  relationshipHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  relationshipTier: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '700',
    textTransform: 'capitalize',
    marginBottom: spacing.xs,
  },
  relationshipCopy: { ...typography.bodySmall, color: colors.text, marginBottom: spacing.sm },
  relationshipNotice: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },

  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  serviceCopy: { flex: 1, marginRight: spacing.md },
  serviceRowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  serviceQuote: { ...typography.body, color: colors.secondary, fontWeight: '600' },
  serviceName: { ...typography.body, color: colors.text, fontWeight: '600' },
  serviceDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 17,
  },
  servicePrice: { ...typography.body, color: colors.primary, fontWeight: '600' },

  scheduleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  scheduleItem: {
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  scheduleDay: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  scheduleTime: { ...typography.caption, color: colors.textSecondary },

  portfolioScroll: { marginHorizontal: -spacing.base },
  portfolioCard: {
    width: 160,
    marginLeft: spacing.sm,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  portfolioImage: {
    width: 160,
    height: 160,
    backgroundColor: colors.border,
  },
  portfolioCaption: {
    ...typography.caption,
    color: colors.textSecondary,
    padding: spacing.xs,
  },
  portfolioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  portfolioCardWide: {
    width: 190,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  portfolioImageWide: { width: '100%', height: 160, backgroundColor: colors.border },

  certRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  certIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  certIconText: { fontSize: 18 },
  certInfo: { flex: 1 },
  certName: { ...typography.body, color: colors.text, fontWeight: '600' },
  certIssuer: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  certExpiry: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  certVerifiedBadge: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
    marginLeft: spacing.sm,
  },
  certVerifiedText: { ...typography.caption, color: colors.success, fontWeight: '600' },

  ratingOverview: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing.lg,
  },
  ratingBig: { fontSize: 48, fontWeight: '800', color: colors.text },
  ratingOutOf: { ...typography.h3, color: colors.textTertiary, marginLeft: spacing.xs },
  noRating: { ...typography.bodySmall, color: colors.textTertiary, fontStyle: 'italic' },
  ratingStars: { ...typography.body, color: colors.text },

  ratingBreakdown: { marginBottom: spacing.md },
  ratingBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  ratingBarLabel: { ...typography.caption, color: colors.textSecondary, width: 100 },
  ratingBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: colors.divider,
    borderRadius: 3,
    marginHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  ratingBarFill: {
    height: 6,
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  ratingBarValue: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
    width: 26,
    textAlign: 'right',
  },

  reviewCard: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  reviewDate: { ...typography.caption, color: colors.textTertiary },
  reviewComment: { ...typography.body, color: colors.text },
  responseCard: {
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    borderRadius: borderRadius.sm,
    marginTop: spacing.sm,
  },
  responseLabel: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
    marginBottom: 2,
  },
  responseText: { ...typography.bodySmall, color: colors.text },

  // shieldBadge styles removed in Phase 14 D04 SiguradoShield pull (Bug 834).
  // Do NOT reintroduce shieldBadge* without lifting LAUNCH-LIMITATIONS §23.

  bottomSpacer: { height: spacing.lg },

  errorEmoji: { fontSize: 48, marginBottom: 12 },
  errorEmojiWrap: { marginBottom: 12, alignItems: 'center' as const },
  errorTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.sm },
  errorSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: spacing.base,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
  },
  retryButtonText: { color: colors.white, fontWeight: '600' as const },

  errorBanner: {
    backgroundColor: colors.errorLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  errorBannerText: { ...typography.bodySmall, color: colors.error, textAlign: 'center' as const },
});
