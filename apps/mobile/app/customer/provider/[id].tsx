import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getProviderProfile } from '@/services/provider.service';
import { getProviderReviews } from '@/services/review.service';
import { Badge, Button } from '@/components/ui';
import { formatPHP } from '@/utils/currency';
import { formatDate } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

const TIER_COLORS: Record<string, string> = {
  new: colors.tierNew,
  verified: colors.tierVerified,
  pro: colors.tierPro,
  elite: colors.tierElite,
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TIER_LABELS: Record<string, string> = {
  new: 'New Provider',
  verified: 'Verified',
  pro: 'Pro Provider',
  elite: 'Elite Provider',
};

function StarDisplay({ rating }: { rating: number | null }): React.ReactElement {
  if (rating == null) return <Text style={styles.noRating}>New</Text>;
  const full = Math.floor(rating);
  return (
    <Text style={styles.ratingStars}>
      {'⭐'.repeat(full)} {rating.toFixed(1)}
    </Text>
  );
}

function RatingBar({ label, value }: { label: string; value: number | null }): React.ReactElement | null {
  if (value == null) return null;
  const pct = Math.min(100, (value / 5) * 100);
  return (
    <View style={styles.ratingBarRow}>
      <Text style={styles.ratingBarLabel}>{label}</Text>
      <View style={styles.ratingBarTrack}>
        <View style={[styles.ratingBarFill, { width: `${pct}%` as unknown as number }]} />
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

  const { data: provider, isLoading: providerLoading } = useQuery({
    queryKey: ['provider', id],
    queryFn: () => getProviderProfile(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: reviewsData } = useQuery({
    queryKey: ['providerReviews', id],
    queryFn: () => getProviderReviews(id, 1, 10),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  const reviews = reviewsData?.reviews ?? [];
  const aggregate = reviewsData?.aggregate;

  if (providerLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!provider) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Provider not found.</Text>
        <Button title="Go Back" onPress={() => router.back()} variant="outline" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Provider Profile</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>
              {provider.name?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
          {provider.name && (
            <Text style={styles.providerNameText}>{provider.name}</Text>
          )}
          <View style={styles.tierRow}>
            <Badge
              label={provider.tier.toUpperCase()}
              backgroundColor={TIER_COLORS[provider.tier] ?? colors.textTertiary}
              size="md"
            />
            <Text style={styles.tierLabel}>
              {TIER_LABELS[provider.tier] ?? provider.tier}
            </Text>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>
                <StarDisplay rating={provider.rating} />
              </Text>
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
                <Text style={styles.infoBadgeText}>🛠 {provider.yearsExperience}+ yrs exp</Text>
              </View>
            )}
            {provider.acceptanceRate != null && provider.acceptanceRate >= 80 && (
              <View style={styles.infoBadge}>
                <Text style={styles.infoBadgeText}>✅ {Math.round(provider.acceptanceRate)}% accept</Text>
              </View>
            )}
            {provider.serviceRadiusKm != null && (
              <View style={styles.infoBadge}>
                <Text style={styles.infoBadgeText}>📍 {provider.serviceRadiusKm} km radius</Text>
              </View>
            )}
            {provider.sukiCount > 0 && (
              <View style={styles.infoBadge}>
                <Text style={styles.infoBadgeText}>💚 {provider.sukiCount} Suki{provider.sukiCount !== 1 ? 's' : ''}</Text>
              </View>
            )}
            {provider.city && (
              <View style={styles.infoBadge}>
                <Text style={styles.infoBadgeText}>🏙 {provider.city}{provider.province ? `, ${provider.province}` : ''}</Text>
              </View>
            )}
          </View>
        </View>

        {provider.bio && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.bioText}>{provider.bio}</Text>
          </View>
        )}

        {provider.services.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Services Offered</Text>
            {provider.services.map((svc) => (
              <View key={svc.id} style={styles.serviceRow}>
                <Text style={styles.serviceName}>{svc.subcategoryName}</Text>
                {svc.basePrice != null && (
                  <Text style={styles.servicePrice}>{formatPHP(svc.basePrice)}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {provider.schedule.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Availability</Text>
            <View style={styles.scheduleGrid}>
              {provider.schedule
                .filter((s) => s.isAvailable)
                .map((slot) => (
                  <View key={slot.id} style={styles.scheduleItem}>
                    <Text style={styles.scheduleDay}>{DAY_NAMES[slot.dayOfWeek]}</Text>
                    <Text style={styles.scheduleTime}>{slot.startTime} – {slot.endTime}</Text>
                  </View>
                ))}
            </View>
          </View>
        )}

        {provider.portfolio.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Portfolio</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.portfolioScroll}>
              {provider.portfolio.map((item) => (
                <View key={item.id} style={styles.portfolioCard}>
                  <Image source={{ uri: item.imageUrl }} style={styles.portfolioImage} resizeMode="cover" />
                  {item.caption ? (
                    <Text style={styles.portfolioCaption} numberOfLines={2}>{item.caption}</Text>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {provider.certifications.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Certifications</Text>
            {provider.certifications.map((cert) => (
              <View key={cert.id} style={styles.certRow}>
                <View style={styles.certIcon}>
                  <Text style={styles.certIconText}>{cert.isVerified ? '✅' : '📜'}</Text>
                </View>
                <View style={styles.certInfo}>
                  <Text style={styles.certName}>{cert.name}</Text>
                  <Text style={styles.certIssuer}>{cert.issuingBody}</Text>
                  {cert.expiryDate && (
                    <Text style={styles.certExpiry}>
                      Valid until {cert.expiryDate}
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

        {aggregate && (
          <View style={styles.section}>
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

        <TouchableOpacity
          style={styles.shieldBadge}
          onPress={() => router.push('/customer/safety' as never)}
          activeOpacity={0.7}
        >
          <Text style={styles.shieldBadgeIcon}>🛡️</Text>
          <Text style={styles.shieldBadgeText}>
            Bookings through onService include SiguradoShield™ protection
          </Text>
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  errorText: { ...typography.body, color: colors.error, marginBottom: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm },
  backIcon: { fontSize: 24, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base },

  profileCard: { alignItems: 'center', marginBottom: spacing.xl },
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
  providerNameText: { ...typography.h2, color: colors.text, marginTop: spacing.sm, marginBottom: spacing.xs },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  tierLabel: { ...typography.bodySmall, color: colors.textSecondary },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    backgroundColor: colors.backgroundSecondary,
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
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  infoBadgeText: { ...typography.caption, color: colors.textSecondary },

  section: { marginBottom: spacing.xl },
  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewCount: { ...typography.bodySmall, color: colors.textTertiary },

  bioText: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },

  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  serviceName: { ...typography.body, color: colors.text, flex: 1 },
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

  certRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  certIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
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
  ratingBarValue: { ...typography.caption, color: colors.text, fontWeight: '600', width: 26, textAlign: 'right' },

  reviewCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
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
  responseLabel: { ...typography.caption, color: colors.primary, fontWeight: '600', marginBottom: 2 },
  responseText: { ...typography.bodySmall, color: colors.text },

  shieldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.infoLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.base,
    gap: spacing.sm,
  },
  shieldBadgeIcon: { fontSize: 22 },
  shieldBadgeText: { ...typography.bodySmall, color: colors.infoDark, flex: 1 },

  bottomSpacer: { height: 40 },
});
