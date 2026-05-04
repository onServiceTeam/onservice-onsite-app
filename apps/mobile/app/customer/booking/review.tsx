import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createReview, type CreateReviewPayload } from '@/services/review.service';
import { getErrorMessage } from '@/utils/errors';
import { useImagePicker } from '@/hooks/useImagePicker';
import { Button, Input } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Star, Lock } from '@/components/icons';

const STAR_OPTIONS = [1, 2, 3, 4, 5];
const SUB_CATEGORIES = [
  { key: 'qualityRating', label: 'Quality of Work' },
  { key: 'punctualityRating', label: 'Punctuality' },
  { key: 'professionalismRating', label: 'Professionalism' },
  { key: 'communicationRating', label: 'Communication' },
  { key: 'valueRating', label: 'Value for Money' },
] as const;

const QUICK_TAGS: { key: string; label: string }[] = [
  { key: 'professional', label: 'Professional' },
  { key: 'punctual', label: 'Punctual' },
  { key: 'great_value', label: 'Great Value' },
  { key: 'friendly', label: 'Friendly' },
  { key: 'clean', label: 'Cleaned Up Well' },
  { key: 'thorough', label: 'Thorough' },
  { key: 'responsive', label: 'Responsive' },
  { key: 'skilled', label: 'Skilled' },
];

type SubKey = typeof SUB_CATEGORIES[number]['key'];

function StarRow({
  value,
  onChange,
  size = 32,
}: {
  value: number;
  onChange: (val: number) => void;
  size?: number;
}): React.ReactElement {
  return (
    <View style={styles.starRow}>
      {STAR_OPTIONS.map((star) => (
        <TouchableOpacity key={star} onPress={() => onChange(star)} activeOpacity={0.6}>
          <Star size={size} color={star <= value ? colors.warning : colors.textTertiary} fill={star <= value ? colors.warning : 'none'} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function ReviewScreen(): React.ReactElement {
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
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState('');
  const [privateNote, setPrivateNote] = useState('');
  const [loading, setLoading] = useState(false);

  // BUG-PHASE56-02 fix — pre-fix the review screen had no UI to
  // upload photos with a review even though `CreateReviewPayload`
  // accepts `imageUrls?: string[]` and the provider Reviews screen
  // (post BUG-PHASE54-01 fix) renders them. Customers wanting to
  // visually praise a great job — or document a complaint via the
  // public review path rather than a formal dispute — had no way
  // to attach images. Now: useImagePicker (same hook the dispute
  // flow uses) wired to the review with a max of 5 photos.
  const imagePicker = useImagePicker({ context: 'review', maxImages: 5 });

  const toggleTag = (key: string): void => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else if (next.size < 5) {
        next.add(key);
      }
      return next;
    });
  };

  const handleSubmit = async (): Promise<void> => {
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
      // BUG-PHASE56-02 — upload any picked images first, then post
      // the URLs alongside the review payload.
      const uploadedUrls = imagePicker.localUris.length > 0
        ? await imagePicker.uploadAll()
        : [];

      const payload: CreateReviewPayload = {
        bookingId,
        rating: overallRating,
        ...(subRatings.qualityRating > 0 && { qualityRating: subRatings.qualityRating }),
        ...(subRatings.punctualityRating > 0 && { punctualityRating: subRatings.punctualityRating }),
        ...(subRatings.professionalismRating > 0 && { professionalismRating: subRatings.professionalismRating }),
        ...(subRatings.communicationRating > 0 && { communicationRating: subRatings.communicationRating }),
        ...(subRatings.valueRating > 0 && { valueRating: subRatings.valueRating }),
        ...(selectedTags.size > 0 && { tags: Array.from(selectedTags) }),
        ...(uploadedUrls.length > 0 && { imageUrls: uploadedUrls }),
      };
      if (comment.trim().length >= 20) payload.comment = comment.trim();
      if (privateNote.trim().length > 0) payload.privateNote = privateNote.trim();

      await createReview(payload);
      router.replace({ pathname: '/customer/booking/tip', params: { bookingId } });
    } catch (err: unknown) {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      const msg = getErrorMessage(err, 'Failed to submit review. Please try again.');
      Alert.alert('Error', msg);
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

        {/* BUG-PHASE56-02 — review photo attachments. */}
        <View style={styles.photoSection}>
          <Text style={styles.tagLabel}>Photos (optional, up to 5)</Text>
          <View style={styles.photoGrid}>
            {imagePicker.localUris.map((uri, i) => (
              <View key={uri} style={styles.photoThumb}>
                <Image source={{ uri }} style={styles.photoImage} />
                <TouchableOpacity
                  style={styles.removePhotoBtn}
                  onPress={() => imagePicker.removeImage(i)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.removePhotoText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
            {imagePicker.localUris.length < 5 && (
              <TouchableOpacity
                style={[styles.photoThumb, styles.addPhotoBox]}
                onPress={imagePicker.showPickerOptions}
              >
                <Text style={styles.addPhotoPlus}>+</Text>
                <Text style={styles.addPhotoLabel}>Add Photo</Text>
              </TouchableOpacity>
            )}
          </View>
          {imagePicker.isUploading && (
            <View style={styles.uploadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.uploadingText}>Uploading photos…</Text>
            </View>
          )}
        </View>

        <View style={styles.tagSection}>
          <Text style={styles.tagLabel}>What went well? (optional, select up to 5)</Text>
          <View style={styles.tagGrid}>
            {QUICK_TAGS.map((tag) => {
              const selected = selectedTags.has(tag.key);
              return (
                <TouchableOpacity
                  key={tag.key}
                  onPress={() => toggleTag(tag.key)}
                  style={[styles.tagChip, selected && styles.tagChipSelected]}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={tag.label}
                >
                  <Text style={[styles.tagChipText, selected && styles.tagChipTextSelected]}>
                    {selected ? '✓ ' : ''}{tag.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.privateNoteSection}>
          <Input
            label="Private Note to onService (optional)"
            placeholder="Share confidential feedback with us only — not shown publicly"
            value={privateNote}
            onChangeText={setPrivateNote}
            multiline
            numberOfLines={3}
            style={styles.commentInput}
            hint={privateNote.length > 0 ? `${privateNote.length} / 1000 characters` : undefined}
          />
          <View style={styles.privateNoteRow}>
            <Lock size={14} color={colors.textSecondary} />
            <Text style={styles.privateNoteHint}> This note is only visible to our support team, not the provider or public.</Text>
          </View>
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
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
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

  tagSection: { marginBottom: spacing.lg },
  tagLabel: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '500', marginBottom: spacing.sm },
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tagChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  tagChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  tagChipText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '500' },
  tagChipTextSelected: { color: colors.primary, fontWeight: '600' },

  photoSection: { marginBottom: spacing.lg },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: spacing.sm },
  photoThumb: { width: 80, height: 80, borderRadius: borderRadius.md, backgroundColor: colors.backgroundSecondary, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  photoImage: { width: '100%', height: '100%' },
  removePhotoBtn: { position: 'absolute', top: -5, right: -5, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  removePhotoText: { color: colors.white, fontSize: 13, fontWeight: '700', lineHeight: 16 },
  addPhotoBox: { borderStyle: 'dashed', borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  addPhotoPlus: { fontSize: 22, color: colors.primary },
  addPhotoLabel: { fontSize: 10, color: colors.primary, marginTop: 1 },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  uploadingText: { ...typography.bodySmall, color: colors.primary },

  privateNoteSection: { marginBottom: spacing.base },
  privateNoteHint: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  privateNoteRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: spacing.xs },

  bottomBar: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.xs,
  },
});
