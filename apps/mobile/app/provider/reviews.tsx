import React, { useState, useCallback } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Image,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMyProfile } from '@/services/provider-api.service';
import api from '@/services/api';
// A7 — shared UI kit for loading/empty/error states + toast feedback.
import { Button, SkeletonCard, EmptyState, ErrorState } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { formatRelative } from '@/utils/date';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Star } from '@/components/icons';

interface ReviewImage {
  id: string;
  imageUrl: string;
}

interface Review {
  id: string;
  bookingId: string;
  reviewerId: string;
  providerId: string;
  rating: number;
  qualityRating: number | null;
  punctualityRating: number | null;
  professionalismRating: number | null;
  communicationRating: number | null;
  valueRating: number | null;
  comment: string;
  providerResponse: string | null;
  providerResponseAt: string | null;
  isVisible: boolean;
  isFlagged: boolean;
  images: ReviewImage[];
  createdAt: string;
}

interface Aggregate {
  overall: number | null;
  totalReviews: number;
  quality: number | null;
  punctuality: number | null;
  professionalism: number | null;
  communication: number | null;
  value: number | null;
}

async function getProviderReviews(providerId: string, page: number, pageSize: number): Promise<{
  reviews: Review[];
  aggregate: Aggregate;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const res = await api.get<{
    success: boolean;
    data: Review[];
    aggregate: Aggregate;
    pagination: { total: number; page: number; pageSize: number; totalPages: number };
  }>(`/api/v1/reviews/provider/${providerId}`, { params: { page, pageSize } });
  return {
    reviews: res.data.data,
    aggregate: res.data.aggregate,
    ...res.data.pagination,
  };
}

async function submitResponse(reviewId: string, response: string): Promise<Review> {
  const res = await api.post<{ success: boolean; data: Review }>(
    `/api/v1/reviews/${reviewId}/response`,
    { response },
  );
  return res.data.data;
}

function StarRating({ rating, size = 14 }: { rating: number; size?: number }): React.ReactElement {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <Star key={i} size={size} color={i <= rating ? colors.warning : colors.border} fill={i <= rating ? colors.warning : 'transparent'} />,
    );
  }
  return <View style={{ flexDirection: 'row', gap: 1 }}>{stars}</View>;
}

function RatingBar({ label, value }: { label: string; value: number | null }): React.ReactElement | null {
  if (value == null) return null;
  return (
    <View style={styles.ratingBarRow}>
      <Text style={styles.ratingBarLabel}>{label}</Text>
      <View style={styles.ratingBarTrack}>
        <View style={[styles.ratingBarFill, { width: `${(value / 5) * 100}%` }]} />
      </View>
      <Text style={styles.ratingBarValue}>{value.toFixed(1)}</Text>
    </View>
  );
}

export default function ProviderReviewsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');

  const profileQuery = useQuery({
    queryKey: ['providerProfile'],
    queryFn: getMyProfile,
    staleTime: 60 * 1000,
  });

  const providerId = profileQuery.data?.id;

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isRefetching,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['providerReviews', providerId],
    queryFn: ({ pageParam = 1 }) => getProviderReviews(providerId!, pageParam as number, 15),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    enabled: !!providerId,
    staleTime: 30 * 1000,
  });

  const responseMutation = useMutation({
    mutationFn: () => submitResponse(respondingTo!, responseText.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['providerReviews'] });
      setRespondingTo(null);
      setResponseText('');
      showToast('Your response has been posted.', 'success');
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      showToast(getErrorMessage(err, 'Failed to submit response.'), 'error');
    },
  });

  const reviews = data?.pages.flatMap((p) => p.reviews) ?? [];
  const aggregate = data?.pages[0]?.aggregate ?? null;
  const onRefresh = useCallback(() => { void refetch(); }, [refetch]);

  const renderHeader = (): React.ReactElement | null => {
    if (!aggregate) return null;
    return (
      <View style={styles.aggregateCard}>
        <View style={styles.aggregateTop}>
          <View style={styles.overallBox}>
            <Text style={styles.overallValue}>
              {aggregate.overall != null ? aggregate.overall.toFixed(1) : '—'}
            </Text>
            {aggregate.overall != null && <StarRating rating={Math.round(aggregate.overall)} size={18} />}
            <Text style={styles.totalReviews}>{aggregate.totalReviews} reviews</Text>
          </View>
          <View style={styles.breakdownBox}>
            <RatingBar label="Quality" value={aggregate.quality} />
            <RatingBar label="Punctuality" value={aggregate.punctuality} />
            <RatingBar label="Professional" value={aggregate.professionalism} />
            <RatingBar label="Communication" value={aggregate.communication} />
            <RatingBar label="Value" value={aggregate.value} />
          </View>
        </View>
      </View>
    );
  };

  const renderReview = ({ item }: { item: Review }): React.ReactElement => (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <StarRating rating={item.rating} />
        <Text style={styles.reviewDate}>{formatRelative(item.createdAt)}</Text>
      </View>
      {item.comment && <Text style={styles.reviewComment}>{item.comment}</Text>}

      {/* BUG-PHASE54-01 fix — pre-fix the Review interface declared
          an `images` array and the API returned it (per
          /reviews/provider/:id), but the screen never rendered the
          images. Customers attaching photos to reviews (which is
          how disputes-of-rebuttal evidence flows for damage claims
          per Phase E CRIT-105) had their proof ignored on the
          provider's side. Now: horizontal image strip with
          tappable thumbnails. */}
      {item.images && item.images.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.reviewImagesRow}
        >
          {item.images.map((img) => (
            <Image
              key={img.id}
              source={{ uri: img.imageUrl }}
              style={styles.reviewImage}
            />
          ))}
        </ScrollView>
      )}

      {item.providerResponse && (
        <View style={styles.responseBox}>
          <Text style={styles.responseLabel}>Your Response</Text>
          <Text style={styles.responseText}>{item.providerResponse}</Text>
        </View>
      )}

      {!item.providerResponse && respondingTo !== item.id && (
        <TouchableOpacity
          style={styles.respondButton}
          onPress={() => { setRespondingTo(item.id); setResponseText(''); }}
        >
          <Text style={styles.respondText}>Reply to Review</Text>
        </TouchableOpacity>
      )}

      {respondingTo === item.id && (
        <View style={styles.respondForm}>
          <TextInput
            style={styles.respondInput}
            value={responseText}
            onChangeText={setResponseText}
            placeholder="Write your response (min 20 characters)..."
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={500}
          />
          <Text style={styles.charCount}>{responseText.length}/500</Text>
          <View style={styles.respondActions}>
            <Button
              title={responseMutation.isPending ? 'Sending...' : 'Submit Response'}
              onPress={() => responseMutation.mutate()}
              loading={responseMutation.isPending}
              disabled={responseMutation.isPending || responseText.trim().length < 20}
            />
            <Button
              title="Cancel"
              onPress={() => setRespondingTo(null)}
              variant="outline"
              disabled={responseMutation.isPending}
            />
          </View>
        </View>
      )}
    </View>
  );

  if (profileQuery.isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Reviews</Text>
        </View>
        <View style={styles.list}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Reviews</Text>
      </View>

      {isError ? (
        <ErrorState
          message="We couldn't load your reviews. Please check your connection and try again."
          onRetry={onRefresh}
        />
      ) : (
        <FlatList
          data={reviews}
          renderItem={renderReview}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.secondary} />
          }
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isFetchingNextPage ? <ActivityIndicator style={styles.loader} color={colors.secondary} /> : null
          }
          ListEmptyComponent={
            isLoading ? (
              <View style={styles.list}>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </View>
            ) : (
              <EmptyState
                icon="⭐"
                title="No reviews yet"
                description="Reviews from customers will appear here."
              />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // App design refresh — soft canvas so the white review cards lift off the page.
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  centered: { alignItems: 'center', justifyContent: 'center' },
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
  backIcon: { fontSize: 24, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },

  list: { padding: spacing.base, paddingBottom: 80 },

  // App design refresh — white surface card with a hairline border on the canvas.
  aggregateCard: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  aggregateTop: { flexDirection: 'row', gap: spacing.lg },
  overallBox: { alignItems: 'center', justifyContent: 'center', width: 80 },
  overallValue: { fontSize: 36, fontWeight: '800', color: colors.text, lineHeight: 42 },
  totalReviews: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  breakdownBox: { flex: 1, gap: spacing.xs },

  ratingBarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ratingBarLabel: { ...typography.caption, color: colors.textSecondary, width: 85 },
  ratingBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  ratingBarFill: { height: 6, backgroundColor: colors.warning, borderRadius: 3 },
  ratingBarValue: { ...typography.caption, color: colors.text, fontWeight: '600', width: 26, textAlign: 'right' },

  // App design refresh — white surface card with a hairline border on the canvas.
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
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  reviewDate: { ...typography.caption, color: colors.textTertiary },
  reviewComment: { ...typography.body, color: colors.text, lineHeight: 22 },
  reviewImagesRow: { marginTop: spacing.sm, flexDirection: 'row', gap: spacing.sm },
  reviewImage: { width: 96, height: 96, borderRadius: borderRadius.md, marginRight: spacing.sm, backgroundColor: colors.border },

  responseBox: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  responseLabel: { ...typography.caption, color: colors.secondary, fontWeight: '600', marginBottom: spacing.xs },
  responseText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },

  respondButton: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  respondText: { ...typography.bodySmall, color: colors.secondary, fontWeight: '600' },

  respondForm: { marginTop: spacing.md },
  respondInput: {
    ...typography.body,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    padding: spacing.base,
    minHeight: 80,
    textAlignVertical: 'top',
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  charCount: { ...typography.caption, color: colors.textTertiary, textAlign: 'right', marginTop: spacing.xs },
  respondActions: { gap: spacing.sm, marginTop: spacing.sm },

  loader: { marginTop: spacing.xl },
  empty: { alignItems: 'center', paddingTop: spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.base },
  emptyIconWrap: { marginBottom: spacing.base, alignItems: 'center' as const },
  emptyText: { ...typography.body, color: colors.textSecondary },
  emptyHint: { ...typography.bodySmall, color: colors.textTertiary, marginTop: spacing.xs },
});
