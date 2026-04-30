import React, { useMemo, useRef, useState } from 'react';
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
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import api from '@/services/api';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Camera, CheckCircle2, Edit } from '@/components/icons';

import { Routes } from '@/config/navigation';
const PHOTO_SLOTS = 4;
const MIN_PHOTOS = 2;

interface SignaturePoint {
  x: number;
  y: number;
}

export default function JobCompleteScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [photos, setPhotos] = useState<(string | null)[]>(() =>
    Array.from({ length: PHOTO_SLOTS }, () => null),
  );
  const [signaturePoints, setSignaturePoints] = useState<SignaturePoint[]>([]);
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const signaturePointsRef = useRef<SignaturePoint[]>([]);

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
    setSignaturePoints([]);
    signaturePointsRef.current = [];
    setSignedAt(null);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt: GestureResponderEvent) => {
          const { locationX, locationY } = evt.nativeEvent;
          const pt = { x: locationX, y: locationY };
          signaturePointsRef.current = [pt];
          setSignaturePoints([pt]);
          if (!signedAt) setSignedAt(new Date().toISOString());
        },
        onPanResponderMove: (evt: GestureResponderEvent, _g: PanResponderGestureState) => {
          const { locationX, locationY } = evt.nativeEvent;
          const pt = { x: locationX, y: locationY };
          signaturePointsRef.current = [...signaturePointsRef.current, pt];
          if (signaturePointsRef.current.length % 4 === 0) {
            setSignaturePoints(signaturePointsRef.current);
          }
        },
        onPanResponderRelease: () => {
          setSignaturePoints(signaturePointsRef.current);
        },
      }),
    [signedAt],
  );

  const photoCount = photos.filter((p): p is string => p !== null).length;
  const hasSignature = signaturePoints.length > 4 && signedAt !== null;
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
      await api.post(`/api/v1/bookings/${id}/complete`, {
        photos: photos.filter((p): p is string => p !== null),
        signedAt,
        notes: notes.trim(),
      });
      Alert.alert('Submitted', 'Job marked as complete.');
      router.replace(Routes.PROVIDER_TABS.DASHBOARD);
    } catch (err) {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      Alert.alert(
        'Submission failed',
        axErr?.response?.data?.error?.message ?? 'Could not submit completion. Please try again.',
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
          <View style={styles.signaturePad} {...panResponder.panHandlers}>
            {signaturePoints.length === 0 ? (
              <View style={styles.signatureHintWrap}>
                <Edit size={20} color={colors.textTertiary} />
                <Text style={styles.signatureHint}>Sign here</Text>
              </View>
            ) : (
              signaturePoints.map((pt, i) => (
                <View
                  key={`pt-${i}`}
                  style={[
                    styles.signatureDot,
                    { left: pt.x - 1.5, top: pt.y - 1.5 },
                  ]}
                />
              ))
            )}
          </View>
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
  signaturePad: {
    height: 180,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: 'hidden',
    position: 'relative',
  },
  signatureHintWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  signatureHint: { ...typography.bodySmall, color: colors.textTertiary },
  signatureDot: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.text,
  },
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
