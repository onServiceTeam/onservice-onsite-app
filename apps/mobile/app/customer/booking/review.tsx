import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createReview, type CreateReviewPayload } from '@/services/review.service';
import { Button, Input } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

const STAR_OPTIONS = [1, 2, 3, 4, 5];
const SUB_CATEGORIES = [
  { key: 'qualityRating', label: 'Quality of Work' },
  { key: 'punctualityRating', label: 'Punctuality' },
  { key: 'professionalismRating', label: 'Professionalism' },
  { key: 'communicationRating', label: 'Communication' },
  { key: 'valueRating', label: 'Value for Money' },
] as const;

type SubKey = typeof SUB_CATEGORIES[number]['key'];

function StarRow({
  value,
  onChange,
  size = 32,
}: {
  value: number;
  onChange: (val: number) => void;
  size?: number;
}) {
  return (
    <View style={styles.starRow}>
      {STAR_OPTIONS.map((star) => (
        <TouchableOpacity key={star} onPress={() => onChange(star)} activeOpacity={0.6}>
          <Text style={{ fontSize: size, opacity: star <= value ? 1 : 0.25 }}>⭐</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function ReviewScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [overallRating, setOverallRating] = useState(0);
  const [subRatings, setSubRatings] = useState<Record<SubKey, number>>({
    qualityRating: 0,
    punctualityRating: 0,
    professionalismRating: 0,
    communicationRating: 0,
    valueRating: 0,
  });
  const [showSubRatings, setShowSubRatings] = useState(false);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (overallRating === 0) {
      Alert.alert('Rating Required', 'Please select an overall rating.');
      return;
    }
    if (comment.length > 0 && comment.length < 20) {
      Alert.alert('Review Too Short', 'Written reviews must be at least 20 characters.');
      return;
    }

    setLoading(true);
    try {
      const payload: CreateReviewPayload = {
        bookingId,
        rating: overallRating,
        ...(subRatings.qualityRating > 0 && { qualityRating: subRatings.qualityRating }),
        ...(subRatings.punctualityRating > 0 && { punctualityRating: subRatings.punctualityRating }),
        ...(subRatings.professionalismRating > 0 && { professionalismRating: subRatings.professionalismRating }),
        ...(subRatings.communicationRating > 0 && { communicationRating: subRatings.communicationRating }),
        ...(subRatings.valueRating > 0 && { valueRating: subRatings.valueRating }),
      };
      if (comment.trim().length >= 20) payload.comment = comment.trim();

      await createReview(payload);
      router.replace({ pathname: '/customer/booking/tip', params: { bookingId } });
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      const msg = axErr?.response?.data?.error?.message;
      Alert.alert('Error', msg ?? 'Failed to submit review. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Rate & Review</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.overallSection}>
          <Text style={styles.overallLabel}>How was the service?</Text>
          <StarRow value={overallRating} onChange={setOverallRating} size={40} />
          {overallRating > 0 && (
            <Text style={styles.ratingText}>
              {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][overallRating]}
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.expandButton}
          onPress={() => setShowSubRatings(!showSubRatings)}
        >
          <Text style={styles.expandLabel}>
            {showSubRatings ? 'Hide' : 'Show'} detailed ratings
          </Text>
          <Text style={styles.expandArrow}>{showSubRatings ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {showSubRatings && (
          <View style={styles.subRatingsContainer}>
            {SUB_CATEGORIES.map((sub) => (
              <View key={sub.key} style={styles.subRatingRow}>
                <Text style={styles.subRatingLabel}>{sub.label}</Text>
                <StarRow
                  value={subRatings[sub.key]}
                  onChange={(val) => setSubRatings((prev) => ({ ...prev, [sub.key]: val }))}
                  size={22}
                />
              </View>
            ))}
          </View>
        )}

        <View style={styles.commentSection}>
          <Input
            label="Written Review (optional)"
            placeholder="Share your experience... (min 20 characters)"
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={4}
            style={styles.commentInput}
            hint={comment.length > 0 ? `${comment.length} / 1000 characters` : undefined}
            error={comment.length > 0 && comment.length < 20 ? 'Must be at least 20 characters' : undefined}
          />
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.base }]}>
        <Button
          title={loading ? 'Submitting...' : 'Submit Review'}
          onPress={handleSubmit}
          loading={loading}
          disabled={overallRating === 0 || loading}
        />
        <Button
          title="Skip"
          onPress={() => router.replace({ pathname: '/customer/booking/tip', params: { bookingId } })}
          variant="ghost"
          disabled={loading}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
  title: { ...typography.h3, color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: 140 },

  overallSection: { alignItems: 'center', marginBottom: spacing.lg },
  overallLabel: { ...typography.h2, color: colors.text, marginBottom: spacing.base },
  starRow: { flexDirection: 'row', gap: spacing.sm },
  ratingText: { ...typography.body, color: colors.primary, fontWeight: '600', marginTop: spacing.sm },

  expandButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  expandLabel: { ...typography.bodySmall, color: colors.primary, fontWeight: '500', marginRight: spacing.xs },
  expandArrow: { fontSize: 12, color: colors.primary },

  subRatingsContainer: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
  },
  subRatingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  subRatingLabel: { ...typography.bodySmall, color: colors.text, fontWeight: '500' },

  commentSection: { marginBottom: spacing.base },
  commentInput: { height: 100, textAlignVertical: 'top' },

  bottomBar: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.xs,
  },
});
