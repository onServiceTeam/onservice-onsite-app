import React, { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getBookingById } from '@/services/booking.service';
// Phase 14 remediation — audited (D14r-9 markers pass)
// Phase E CRIT-102 fix — completion submit now actually persists
// the captured photos.
//
// Pre-fix the screen:
//   1. POSTed to /api/v1/bookings/{id}/complete which DOES NOT EXIST
//      on the backend. Every submit returned 404 and was masked by
//      a generic "Submission failed" toast.
//   2. Even if the endpoint had existed, it sent file:// URIs
//      directly in JSON. The backend's MED-N97 hardening rejects
//      file:// values defensively for any persistence URL field.
//
// Post-fix:
//   - Each captured photo uploaded individually via the existing
//     /api/v1/uploads/booking-photo multipart endpoint with
//     photoType='after' (booking_photos table from migration 079).
//   - The booking is then transitioned via PATCH
//     /api/v1/bookings/:id/status with status='completed_by_provider'
//     (the canonical state machine from booking.service.ts).
//
// Phase E CRIT-103/104 fix (E01 Option A landed) — customer
// signature now produces a real PNG bitmap via the new SignaturePad
// component (react-native-signature-canvas under the hood). Submit
// reads the canvas, writes the base64 to a cache file, then uploads
// via the existing /api/v1/uploads/booking-signature endpoint with
// signatureType='customer_acceptance' (booking_signatures table).
// Removed the old PanResponder + signaturePoints render path — the
// new pad owns the canvas and returns ready-to-upload pixels.
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureImageAsync } from '@/utils/image-capture';
import api from '@/services/api';
import { listBookingPhotos, uploadBookingPhoto, uploadSignature } from '@/services/booking-photo.service';
import { getErrorMessage } from '@/utils/errors';
import { showToast } from '@/lib/toast';
import SignaturePad, { type SignaturePadRef } from '@/components/SignaturePad';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Camera, CheckCircle2, Edit, ChevronLeft } from '@/components/icons';
// Phase 14 R5-complete — CommissionBreakdown post-complete summary panel.
import CommissionBreakdown from '@/components/provider/CommissionBreakdown';

import { Routes } from '@/config/navigation';
import { useResponsive } from '@/hooks/useResponsive';
const PHOTO_SLOTS = 4;
const MIN_PHOTOS = 2;

export default function JobCompleteScreen({ staffMode = false }: { staffMode?: boolean }): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isPhone } = useResponsive();
  const [photos, setPhotos] = useState<(string | null)[]>(() =>
    Array.from({ length: PHOTO_SLOTS }, () => null),
  );
  // Phase E CRIT-103/104 fix (E01 Option A) — signature state is now
  // a single boolean (the WebView canvas owns the strokes) plus the
  // first-stroke timestamp. The signature pad fires onBegin when the
  // user starts drawing; we record signedAt then. On submit we ask
  // the pad to emit the captured PNG via the imperative ref.
  const [hasSignature, setHasSignature] = useState(false);
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const signaturePadRef = useRef<SignaturePadRef | null>(null);
  // Resolved by the SignaturePad's onCapture callback after we tap
  // submit and call readSignature(). Holds the file:// URI of the
  // freshly written PNG.
  const pendingSignatureUri = useRef<string | null>(null);
  // Promise resolver for the readSignature → onCapture round trip;
  // submit awaits this so the upload happens after the canvas has
  // produced the bitmap.
  const captureResolverRef = useRef<((uri: string) => void) | null>(null);
  // Keep successfully uploaded local artifacts out of an in-screen retry when
  // a later signature or status step fails. Server records remain canonical;
  // these refs only prevent duplicate uploads during this mounted attempt.
  const uploadedPhotoUrisRef = useRef<Set<string>>(new Set());
  const signatureUploadedRef = useRef(false);

  // BUG-PHASE67-03 fix — pre-fix the CommissionBreakdown at the bottom
  // of this screen rendered with hardcoded gross=0, amount=0, net=0
  // and a literal "12%" pct, so the provider saw a useless empty
  // breakdown. Now we fetch the booking's servicePrice + the
  // provider's tier and compute the real preview.
  const bookingQuery = useQuery({
    queryKey: ['booking', id],
    queryFn: () => getBookingById(id ?? ''),
    // The assigned-team closeout does not need customer booking details or
    // provider earnings. Keep that unnecessary owner-side read out of the
    // staff session; the staff workspace already loaded its reduced record.
    enabled: !!id && !staffMode,
  });
  const afterPhotosQuery = useQuery({
    queryKey: ['bookingPhotos', id, 'after'],
    queryFn: () => listBookingPhotos(id ?? '', 'after'),
    enabled: !!id,
  });
  const providerMeQuery = useQuery<{ tier: string; commissionRate: number }>({
    queryKey: ['providerMe'],
    queryFn: async () => {
      const res = await api.get<{ data: { tier: string; commissionRate: number } }>('/api/v1/providers/me');
      return { tier: res.data.data.tier, commissionRate: res.data.data.commissionRate };
    },
    staleTime: 5 * 60 * 1000,
    enabled: !staffMode,
  });
  const providerTier = providerMeQuery.data?.tier;
  const tierRate = providerMeQuery.data?.commissionRate;
  const tierPct = tierRate == null ? null : Math.round(tierRate * 100);
  const grossEarnings = bookingQuery.data?.servicePrice ?? 0;
  const commissionAmount = tierRate == null ? null : Math.round(grossEarnings * tierRate);
  const netEarnings = commissionAmount == null ? null : grossEarnings - commissionAmount;

  const pickPhoto = async (index: number): Promise<void> => {
    try {
      const capture = await captureImageAsync({ quality: 0.7 });
      if (capture.status === 'denied') {
        Alert.alert('Camera permission', 'Please allow camera access to add photos.');
        return;
      }
      const { result } = capture;
      if (result.canceled || result.assets.length === 0) return;
      const asset = result.assets[0];
      if (!asset) return;
      setPhotos((prev) => {
        const next = prev.slice();
        next[index] = asset.uri;
        return next;
      });
    } catch {
      Alert.alert('Camera unavailable', 'Could not open the camera on this device.');
    }
  };

  const clearSignature = (): void => {
    signaturePadRef.current?.clear();
    setHasSignature(false);
    setSignedAt(null);
    pendingSignatureUri.current = null;
  };

  const handleSignatureBegin = (): void => {
    if (!signedAt) setSignedAt(new Date().toISOString());
    setHasSignature(true);
  };

  const handleSignatureCapture = (uri: string): void => {
    pendingSignatureUri.current = uri;
    captureResolverRef.current?.(uri);
    captureResolverRef.current = null;
  };

  /**
   * Ask the WebView for the current signature as a PNG file URI.
   * Resolves once SignaturePad fires onCapture (round-trip via the
   * library's onOK). Times out after 5s to avoid hanging the submit
   * if the WebView never responds.
   */
  const readSignatureFile = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        captureResolverRef.current = null;
        reject(new Error('Signature capture timed out. Please try again.'));
      }, 5000);
      captureResolverRef.current = (uri: string) => {
        clearTimeout(timer);
        resolve(uri);
      };
      signaturePadRef.current?.readSignature();
    });
  };

  const photoCount = photos.filter((p): p is string => p !== null).length;
  const existingAfterPhotos = afterPhotosQuery.data ?? [];
  const totalAfterPhotoCount = existingAfterPhotos.length + photoCount;
  const canSubmit = totalAfterPhotoCount >= MIN_PHOTOS && (staffMode || hasSignature) && !submitting;

  const handleSubmit = async (): Promise<void> => {
    if (!id) {
      Alert.alert('Missing booking', 'No booking ID was provided.');
      return;
    }
    if (totalAfterPhotoCount < MIN_PHOTOS) {
      Alert.alert('Photos required', `Please capture at least ${MIN_PHOTOS} completion photos.`);
      return;
    }
    if (!staffMode && (!hasSignature || !signedAt)) {
      Alert.alert('Signature required', 'Please get the customer to sign before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      // Phase E CRIT-102 fix — upload each captured photo to the
      // existing /uploads/booking-photo multipart endpoint with
      // photoType='after'. Pre-fix the file:// URIs were sent
      // verbatim in JSON to a 404 endpoint and dropped on the floor.
      const validPhotos = photos.filter((p): p is string => p !== null);
      for (const photoUri of validPhotos) {
        if (uploadedPhotoUrisRef.current.has(photoUri)) continue;
        await uploadBookingPhoto({ uri: photoUri, bookingId: id, photoType: 'after' });
        uploadedPhotoUrisRef.current.add(photoUri);
      }

      // Phase E CRIT-103/104 fix (E01 Option A) — read the signature
      // PNG out of the WebView canvas and upload it to the existing
      // /uploads/booking-signature multipart endpoint with
      // signatureType='customer_acceptance' (booking_signatures
      // table from migration 079). E19 records that this provider-session
      // capture is not verified customer identity evidence.
      if (!staffMode && !signatureUploadedRef.current) {
        const signatureUri = await readSignatureFile();
        await uploadSignature({
          uri: signatureUri,
          bookingId: id,
          signatureType: 'customer_acceptance',
        });
        signatureUploadedRef.current = true;
      }

      // Phase E CRIT-102 fix — transition the booking via the real
      // canonical PATCH /:id/status endpoint. The transition handler
      // in booking.service.ts enforces minimumTimeOnSiteMinutes etc.
      // BUG-PHASE151-01 fix — pre-fix sent `notes` which the
      // updateBookingStatusSchema didn't declare, so Zod silently
      // stripped it. The provider's completion notes have been
      // theatrical since the feature was built. Now: rename to
      // `completionNotes` (matches the validator field added in the
      // same phase + bookings.completion_notes column added by
      // migration 126_phase151).
      await api.patch(`/api/v1/bookings/${id}/status`, {
        status: 'completed_by_provider',
        completionNotes: notes.trim() || undefined,
      });

      // Refresh the booking + the provider's job lists so the dashboard
      // doesn't keep showing this job as in-progress from stale cache.
      void queryClient.invalidateQueries({ queryKey: ['booking', id] });
      void queryClient.invalidateQueries({ queryKey: ['bookingPhotos', id] });
      void queryClient.invalidateQueries({ queryKey: ['bookingProofSummary', id] });
      void queryClient.invalidateQueries({ queryKey: ['providerJobs'] });
      void queryClient.invalidateQueries({ queryKey: ['staffJobs'] });
      // A7 — non-blocking toast then return to the dashboard; was a modal Alert.
      showToast('Job marked as complete.', 'success');
      router.replace(staffMode ? Routes.STAFF.JOBS : Routes.PROVIDER_TABS.DASHBOARD);
    } catch (err) {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper (A7: non-blocking toast).
      showToast(
        getErrorMessage(err, 'Could not submit completion. Please try again.'),
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Complete Job</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[styles.workspace, !isPhone && styles.workspaceWide]}
          accessibilityLabel={isPhone
            ? `${staffMode ? 'Team member' : 'Provider'} job completion`
            : `Tablet and desktop ${staffMode ? 'team member' : 'provider'} job completion workspace`}
        >
        <View style={styles.primaryColumn}>
        <View style={[styles.section, styles.sectionCard]}>
          <Text style={styles.sectionTitle}>Final Photos</Text>
          <Text style={styles.sectionHint}>
            At least {MIN_PHOTOS} completion photos are required. {existingAfterPhotos.length} on file + {photoCount} new ({totalAfterPhotoCount}/{MIN_PHOTOS} required).
          </Text>
          {afterPhotosQuery.isError ? (
            <TouchableOpacity style={styles.photoLoadWarning} onPress={() => void afterPhotosQuery.refetch()}>
              <Text style={styles.photoLoadWarningText}>Existing photos could not be verified. Tap to retry, or add two new photos.</Text>
            </TouchableOpacity>
          ) : null}
          {existingAfterPhotos.length > 0 ? (
            <View style={styles.existingPhotos}>
              <Text style={styles.existingPhotosLabel}>Already uploaded</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {existingAfterPhotos.map((photo) => (
                  <Image key={photo.id} source={{ uri: photo.storageUrl }} style={styles.existingPhoto} resizeMode="cover" />
                ))}
              </ScrollView>
            </View>
          ) : null}
          <Text style={styles.newPhotosLabel}>Add more photos</Text>
          <View style={styles.photoGrid}>
            {photos.map((uri, idx) => (
              <TouchableOpacity
                key={`photo-${idx}`}
                style={styles.photoTile}
                onPress={() => { void pickPhoto(idx); }}
                activeOpacity={0.7}
              >
                {uri ? (
                  <Image source={{ uri }} style={styles.photoImage} resizeMode="cover" />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Camera size={28} color={colors.textTertiary} />
                    <Text style={styles.photoPlaceholderText}>Tap to capture</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
        </View>

        <View style={styles.secondaryColumn}>
        <View style={styles.readinessCard}>
          <Text style={styles.readinessEyebrow}>COMPLETION READINESS</Text>
          <Text style={styles.readinessValue}>{totalAfterPhotoCount >= MIN_PHOTOS ? 'Photos ready' : `${MIN_PHOTOS - totalAfterPhotoCount} more photo${MIN_PHOTOS - totalAfterPhotoCount === 1 ? '' : 's'} needed`}</Text>
          <Text style={styles.readinessValue}>
            {staffMode ? 'Checklist and server work-time rules also apply' : hasSignature ? 'Signature captured' : 'Customer signature needed'}
          </Text>
        </View>
        {staffMode ? (
          <View style={styles.staffNotice}>
            <Text style={styles.staffNoticeTitle}>Team-member closeout</Text>
            <Text style={styles.staffNoticeText}>
              Submit the job record with the required after photos and notes. Customer acceptance is handled separately and is not recorded from your team-member session.
            </Text>
          </View>
        ) : (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Customer Signature</Text>
            {hasSignature && (
              <TouchableOpacity onPress={clearSignature} style={styles.clearLink}>
                <Text style={styles.clearLinkText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.sectionHint}>
            Ask the customer to sign below to confirm the work was completed.
          </Text>
          {/* Phase E CRIT-103/104 fix (E01 Option A) — real signature
               canvas (WebView-backed); replaces the dot-rendering
               PanResponder that never produced a real bitmap. */}
          <SignaturePad
            ref={signaturePadRef}
            onCapture={handleSignatureCapture}
            onBegin={handleSignatureBegin}
            height={180}
          />
          {!hasSignature && (
            <View style={styles.signatureHintRow}>
              <Edit size={16} color={colors.textTertiary} />
              <Text style={styles.signatureHint}>Tap inside the box and sign</Text>
            </View>
          )}
          {hasSignature && (
            <View style={styles.signatureMeta}>
              <CheckCircle2 size={16} color={colors.success} />
              <Text style={styles.signatureMetaText}>
                Signed at {new Date(signedAt ?? '').toLocaleTimeString()}
              </Text>
            </View>
          )}
        </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes (optional)</Text>
          {/* BUG-PHASE194-01 fix — pre-fix the Notes TextInput had no
              maxLength. The server-side completionNotes Zod validator
              caps at 2000 (booking.validators.ts post-Phase 151). A
              provider typing 2500 chars hit submit and got a generic
              400 with no field-level guidance. Same pattern as Phase
              145's review-screen fix. Now: maxLength={2000} +
              char counter so the input matches server reality. */}
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            maxLength={2000}
            placeholder="Anything the customer should know…"
            placeholderTextColor={colors.textTertiary}
            style={styles.notesInput}
            textAlignVertical="top"
          />
          {notes.length > 0 && (
            <Text style={styles.notesCount}>{notes.length}/2000</Text>
          )}
        </View>
        </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={[styles.footerContent, !isPhone && styles.footerContentWide]}>
        <TouchableOpacity
          style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
          onPress={() => { void handleSubmit(); }}
          disabled={!canSubmit}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.primaryBtnText}>Submit Completion</Text>
          )}
        </TouchableOpacity>
        {/* BUG-PHASE67-03 fix — CommissionBreakdown post-complete preview
            now uses REAL servicePrice + tier-specific commission rate. */}
        {!staffMode && grossEarnings > 0 && tierPct != null && commissionAmount != null && netEarnings != null && providerTier && (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={{ ...typography.h3, color: colors.text, marginBottom: spacing.sm }}>Earnings preview</Text>
            <CommissionBreakdown
              gross={grossEarnings}
              lines={[
                {
                  label: 'Platform commission',
                  amount: commissionAmount,
                  pct: tierPct,
                  helpText: `Live rate for your ${providerTier} tier at the time this preview loaded.`,
                },
              ]}
              net={netEarnings}
            />
          </View>
        )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 44 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: spacing.xl },
  bodyContentWide: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: spacing.xl },
  workspace: { gap: spacing.base },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  primaryColumn: { flex: 1, minWidth: 0 },
  secondaryColumn: { flex: 1, minWidth: 0 },
  section: { marginBottom: spacing.lg },
  sectionCard: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { ...typography.h3, color: colors.text },
  sectionHint: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  existingPhotos: { marginBottom: spacing.base },
  existingPhotosLabel: { ...typography.caption, color: colors.textTertiary, fontWeight: '700', marginBottom: spacing.sm },
  existingPhoto: { width: 88, height: 88, borderRadius: borderRadius.md, marginRight: spacing.sm },
  newPhotosLabel: { ...typography.bodySmall, color: colors.text, fontWeight: '700', marginBottom: spacing.sm },
  photoLoadWarning: {
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.base,
  },
  photoLoadWarningText: { ...typography.bodySmall, color: colors.text, lineHeight: 19 },
  photoTile: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.backgroundSecondary,
  },
  photoImage: { width: '100%', height: '100%' },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  photoPlaceholderText: { ...typography.caption, color: colors.textTertiary },
  readinessCard: {
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.base,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  readinessEyebrow: { ...typography.caption, color: colors.primary, fontWeight: '800', letterSpacing: 0.8 },
  readinessValue: { ...typography.bodySmall, color: colors.text, fontWeight: '700' },
  staffNotice: {
    backgroundColor: colors.infoLight,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.info,
    padding: spacing.base,
    marginBottom: spacing.lg,
  },
  staffNoticeTitle: { ...typography.body, color: colors.infoDark, fontWeight: '700', marginBottom: spacing.xs },
  staffNoticeText: { ...typography.bodySmall, color: colors.infoDark, lineHeight: 20 },
  // Phase E CRIT-103/104 fix — old PanResponder canvas styles
  // (signaturePad, signatureHintWrap, signatureDot) replaced by the
  // new SignaturePad component which owns its own canvas styling.
  signatureHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  signatureHint: { ...typography.bodySmall, color: colors.textTertiary },
  signatureMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  signatureMetaText: { ...typography.caption, color: colors.success, fontWeight: '600' },
  clearLink: { padding: spacing.xs },
  clearLinkText: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },
  notesInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    minHeight: 100,
    color: colors.text,
    ...typography.body,
  },
  // BUG-PHASE194-01 fix — char counter under notes input.
  notesCount: { ...typography.caption, color: colors.textTertiary, textAlign: 'right' as const, marginTop: spacing.xs },
  footer: {
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  footerContent: { paddingHorizontal: spacing.base },
  footerContentWide: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: spacing.xl },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.base,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { ...typography.button, color: colors.white },
});
