import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getBookingById, uploadJobPhotos } from '@/services/booking.service';
import { listBookingPhotos } from '@/services/booking-photo.service';
import { getErrorMessage } from '@/utils/errors';
import { useImagePicker } from '@/hooks/useImagePicker';
// A7 — shared UI kit for loading/error states + toast feedback.
import { SkeletonCard, ErrorState } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ChevronLeft, Camera } from '@/components/icons';

type Phase = 'before' | 'after';

export default function ProviderPhotosScreen(): React.ReactElement {
  const { id: bookingId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activePhase, setActivePhase] = useState<Phase>('before');

  const beforePicker = useImagePicker({ context: 'general', maxImages: 20 });
  const afterPicker = useImagePicker({ context: 'general', maxImages: 20 });

  const { data: booking, isLoading: bookingLoading, isError: bookingError, refetch, isRefetching } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBookingById(bookingId ?? ''),
    enabled: !!bookingId,
  });

  // BUG-PHASE71-03 fix — pre-fix this screen read existingBefore +
  // existingAfter from booking.providerBeforePhotos /
  // providerAfterPhotos which are deprecated TEXT[] columns from
  // migration 037. Phase E CRIT-102 made `provider/job/[id]/complete`
  // upload "after" photos via /api/v1/uploads/booking-photo (writes
  // ONLY to booking_photos, not the legacy arrays), so any photos
  // captured via the completion flow were INVISIBLE on this screen.
  // Same pattern caught in Phase 56 (customer photos.tsx). Now we
  // also query the canonical booking_photos endpoint and union with
  // the legacy arrays for back-compat with photos uploaded via the
  // dual-write /bookings/:id/photos endpoint.
  const photosQuery = useQuery({
    queryKey: ['bookingPhotos', bookingId],
    queryFn: () => listBookingPhotos(bookingId ?? ''),
    enabled: !!bookingId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (phase: Phase) => {
      const picker = phase === 'before' ? beforePicker : afterPicker;
      const urls = await picker.uploadAll();
      if (urls.length === 0) {
        throw new Error('No photos to upload.');
      }
      return uploadJobPhotos(bookingId ?? '', phase, urls);
    },
    onSuccess: (_data, phase) => {
      const picker = phase === 'before' ? beforePicker : afterPicker;
      picker.reset();
      void queryClient.invalidateQueries({ queryKey: ['booking', bookingId] });
      // BUG-PHASE71-03 fix — also invalidate the canonical photos
      // query so the new uploads appear immediately in existingPhotos.
      void queryClient.invalidateQueries({ queryKey: ['bookingPhotos', bookingId] });
      showToast(`${phase === 'before' ? 'Before' : 'After'} photos saved successfully.`, 'success');
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper (A7: non-blocking toast).
      showToast(getErrorMessage(err, 'Could not upload photos.'), 'error');
    },
  });

  const activePicker = activePhase === 'before' ? beforePicker : afterPicker;
  // BUG-PHASE71-03 fix — union the legacy arrays with the canonical
  // booking_photos rows for the active phase. Dedup by URL so photos
  // dual-written via /bookings/:id/photos don't show twice.
  const canonicalPhotos = (photosQuery.data ?? [])
    .filter((p) => p.photoType === activePhase)
    .map((p) => p.storageUrl);
  const legacyForPhase = activePhase === 'before'
    ? (booking?.providerBeforePhotos ?? [])
    : (booking?.providerAfterPhotos ?? []);
  const existingPhotos = Array.from(new Set([...canonicalPhotos, ...legacyForPhase]));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Job Photos</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.tabRow}>
        {(['before', 'after'] as Phase[]).map((phase) => (
          <TouchableOpacity
            key={phase}
            style={[styles.tab, activePhase === phase && styles.tabActive]}
            onPress={() => setActivePhase(phase)}
          >
            <Text style={[styles.tabText, activePhase === phase && styles.tabTextActive]}>
              {phase === 'before' ? 'Before' : 'After'} Photos
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {bookingLoading && (
          <View style={{ marginBottom: spacing.base }}>
            <SkeletonCard />
          </View>
        )}
        {bookingError && (
          <ErrorState
            compact
            message="We couldn't load this job's photos. Please check your connection and try again."
            onRetry={() => void refetch()}
          />
        )}
        <Text style={styles.phaseHint}>
          {activePhase === 'before'
            ? 'Take photos of the area before you begin. This protects both you and the customer.'
            : 'Take photos after completing the job to document your work quality.'}
        </Text>

        {existingPhotos.length > 0 && (
          <View style={styles.existingSection}>
            <Text style={styles.existingLabel}>Already Uploaded ({existingPhotos.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.existingScroll}>
              {existingPhotos.map((url, i) => (
                <Image key={`existing-${i}`} source={{ uri: url }} style={styles.existingThumb} />
              ))}
            </ScrollView>
          </View>
        )}

        <Text style={styles.sectionLabel}>
          New Photos ({activePicker.localUris.length})
        </Text>

        {activePicker.localUris.length > 0 && (
          <View style={styles.grid}>
            {activePicker.localUris.map((uri, i) => (
              <View key={`new-${i}`} style={styles.thumbWrap}>
                <Image source={{ uri }} style={styles.thumbImg} />
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => activePicker.removeImage(i)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.removeBtnText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={styles.addPhotoBtn}
          onPress={activePicker.showPickerOptions}
        >
          <Camera size={20} color={colors.primary} />
          <Text style={styles.addPhotoText}>Add Photos</Text>
        </TouchableOpacity>

        {activePicker.localUris.length > 0 && (
          <TouchableOpacity
            style={[styles.uploadBtn, (uploadMutation.isPending || activePicker.isUploading) && styles.uploadBtnDisabled]}
            onPress={() => uploadMutation.mutate(activePhase)}
            disabled={uploadMutation.isPending || activePicker.isUploading}
          >
            {(uploadMutation.isPending || activePicker.isUploading) ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.white} />
                <Text style={styles.uploadBtnText}>Uploading...</Text>
              </View>
            ) : (
              <Text style={styles.uploadBtnText}>
                Upload {activePicker.localUris.length} {activePhase === 'before' ? 'Before' : 'After'} Photo{activePicker.localUris.length !== 1 ? 's' : ''}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const THUMB_SIZE = 100;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 30 },

  tabRow: {
    flexDirection: 'row', backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tab: {
    flex: 1, paddingVertical: spacing.md, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { ...typography.body, color: colors.textSecondary },
  tabTextActive: { color: colors.primary, fontWeight: '700' },

  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },

  phaseHint: {
    ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20,
    backgroundColor: colors.primaryLight, padding: spacing.md,
    borderRadius: borderRadius.md, marginBottom: spacing.base,
  },

  existingSection: { marginBottom: spacing.base },
  existingLabel: { ...typography.caption, color: colors.textTertiary, fontWeight: '600', marginBottom: spacing.sm },
  existingScroll: { flexDirection: 'row' },
  existingThumb: {
    width: 70, height: 70, borderRadius: borderRadius.sm,
    marginRight: spacing.sm, backgroundColor: colors.backgroundSecondary,
  },

  sectionLabel: {
    ...typography.body, fontWeight: '600', color: colors.text, marginBottom: spacing.sm,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.base },
  thumbWrap: {
    width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: borderRadius.md,
    overflow: 'hidden', backgroundColor: colors.backgroundSecondary,
  },
  thumbImg: { width: '100%', height: '100%' },
  removeBtn: {
    position: 'absolute', top: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  removeBtnText: { color: colors.white, fontSize: 14, fontWeight: '700' },

  addPhotoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.md, borderRadius: borderRadius.md,
    borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed',
    backgroundColor: colors.backgroundSecondary, gap: spacing.sm,
    marginBottom: spacing.base,
  },
  addPhotoIcon: { fontSize: 20 },
  addPhotoText: { ...typography.body, color: colors.primary, fontWeight: '600' },

  uploadBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingVertical: spacing.md + 2, alignItems: 'center',
  },
  uploadBtnDisabled: { opacity: 0.6 },
  uploadBtnText: { ...typography.body, fontWeight: '700', color: colors.white },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
