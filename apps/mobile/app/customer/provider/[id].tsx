import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getProviderProfile, type ProviderProfile } from '@/services/provider.service';
import { getProviderReviews, type Review } from '@/services/review.service';
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

function StarDisplay({ rating }: { rating: number | null }) {
  if (rating == null) return <Text style={styles.noRating}>New</Text>;
  const full = Math.floor(rating);
  return (
    <Text style={styles.ratingStars}>
      {'⭐'.repeat(full)} {rating.toFixed(1)}
    </Text>
  );
}

export default function ProviderProfileScreen() {
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
          <Badge
            label={provider.tier.toUpperCase()}
            backgroundColor={TIER_COLORS[provider.tier] ?? colors.textTertiary}
            size="md"
          />
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
                {provider.yearsExperience != null ? `${provider.yearsExperience}yr` : '—'}
              </Text>
              <Text style={styles.statLabel}>Experience</Text>
            </View>
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
  avatarLargeText: { color: '#FFFFFF', fontWeight: '800', fontSize: 32 },
  providerNameText: { ...typography.h2, color: colors.text, marginTop: spacing.sm, marginBottom: spacing.xs },

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

  ratingOverview: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing.lg,
  },
  ratingBig: { fontSize: 48, fontWeight: '800', color: colors.text },
  ratingOutOf: { ...typography.h3, color: colors.textTertiary, marginLeft: spacing.xs },
  noRating: { ...typography.bodySmall, color: colors.textTertiary, fontStyle: 'italic' },
  ratingStars: { ...typography.body, color: colors.text },

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

  bottomSpacer: { height: 40 },
});
