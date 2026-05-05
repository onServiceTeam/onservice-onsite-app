import React, { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBookingById } from '@/services/booking.service';
import { platformConfig } from '@/config/platform.config';
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
import * as ImagePicker from 'expo-image-picker';
import api from '@/services/api';
import { uploadBookingPhoto, uploadSignature } from '@/services/booking-photo.service';
import { getErrorMessage } from '@/utils/errors';
import SignaturePad, { type SignaturePadRef } from '@/components/SignaturePad';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Camera, CheckCircle2, Edit } from '@/components/icons';
// Phase 14 R5-complete — CommissionBreakdown post-complete summary panel.
import CommissionBreakdown from '@/components/provider/CommissionBreakdown';

import { Routes } from '@/config/navigation';
const PHOTO_SLOTS = 4;
const MIN_PHOTOS = 2;

export default function JobCompleteScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
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

  // BUG-PHASE67-03 fix — pre-fix the CommissionBreakdown at the bottom
  // of this screen rendered with hardcoded gross=0, amount=0, net=0
  // and a literal "12%" pct, so the provider saw a useless empty
  // breakdown. Now we fetch the booking's servicePrice + the
  // provider's tier and compute the real preview.
  const bookingQuery = useQuery({
    queryKey: ['booking', id],
    queryFn: () => getBookingById(id ?? ''),
    enabled: !!id,
  });
  const providerMeQuery = useQuery<{ tier: string }>({
    queryKey: ['providerMe'],
    queryFn: async () => {
      const res = await api.get<{ data: { tier: string } }>('/api/v1/providers/me');
      return { tier: res.data.data.tier };
    },
    staleTime: 5 * 60 * 1000,
  });
  const providerTier = providerMeQuery.data?.tier ?? 'new';
  const tierRate =
    platformConfig.commissionRates[providerTier] ?? platformConfig.commissionRates.new ?? 0.15;
  const tierPct = Math.round(tierRate * 100);
  const grossEarnings = bookingQuery.data?.servicePrice ?? 0;
  const commissionAmount = Math.round(grossEarnings * tierRate);
  const netEarnings = grossEarnings - commissionAmount;

  const pickPhoto = async (index: number): Promise<void> => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Camera permission', 'Please allow camera access to add photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
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
  const canSubmit = photoCount >= MIN_PHOTOS && hasSignature && !submitting;

  const handleSubmit = async (): Promise<void> => {
    if (!id) {
      Alert.alert('Missing booking', 'No booking ID was provided.');
      return;
    }
    if (photoCount < MIN_PHOTOS) {
      Alert.alert('Photos required', `Please capture at least ${MIN_PHOTOS} completion photos.`);
      return;
    }
    if (!hasSignature || !signedAt) {
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
        await uploadBookingPhoto({ uri: photoUri, bookingId: id, photoType: 'after' });
      }

      // Phase E CRIT-103/104 fix (E01 Option A) — read the signature
      // PNG out of the WebView canvas and upload it to the existing
      // /uploads/booking-signature multipart endpoint with
      // signatureType='customer_acceptance' (booking_signatures
      // table from migration 079). This is the legal proof of work
      // acceptance for dispute defence.
      const signatureUri = await readSignatureFile();
      await uploadSignature({
        uri: signatureUri,
        bookingId: id,
        signatureType: 'customer_acceptance',
      });

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

      Alert.alert('Submitted', 'Job marked as complete.');
      router.replace(Routes.PROVIDER_TABS.DASHBOARD);
    } catch (err) {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      Alert.alert(
        'Submission failed',
        getErrorMessage(err, 'Could not submit completion. Please try again.'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Complete Job</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Final Photos</Text>
          <Text style={styles.sectionHint}>
            Capture at least {MIN_PHOTOS} photos showing the completed work.
            ({photoCount}/{PHOTO_SLOTS})
          </Text>
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes (optional)</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            placeholder="Anything the customer should know…"
            placeholderTextColor={colors.textTertiary}
            style={styles.notesInput}
            textAlignVertical="top"
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
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
        {grossEarnings > 0 && (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={{ ...typography.h3, color: colors.text, marginBottom: spacing.sm }}>Earnings preview</Text>
            <CommissionBreakdown
              gross={grossEarnings}
              lines={[
                {
                  label: `Platform commission (${tierPct}%)`,
                  amount: commissionAmount,
                  pct: tierPct,
                  helpText: `Your tier (${providerTier}). Earn higher tier for lower commission.`,
                },
              ]}
              net={netEarnings}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 44 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: spacing.xl },
  section: { marginBottom: spacing.lg },
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    minHeight: 100,
    color: colors.text,
    ...typography.body,
  },
  footer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
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
