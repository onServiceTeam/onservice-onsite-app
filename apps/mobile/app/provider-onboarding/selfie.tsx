import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureImageAsync, isCameraCaptureAvailable } from '@/utils/image-capture';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { uploadImages } from '@/services/upload.service';
import { ProviderApplicationDraftActions } from '@/components/ProviderApplicationDraftActions';
import { applicationFieldsFromStore } from '@/services/provider-application-draft.service';
import { useApplicationOperation } from '@/hooks/useApplicationOperation';
import { useApplicationSession } from '@/stores/provider-application-session.store';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Camera, Check } from '@/components/icons';
import { useResponsive } from '@/hooks/useResponsive';

import { Routes } from '@/config/navigation';
export default function SelfieScreen(): React.ReactElement {
  const router = useRouter();
  const store = useOnboardingStore();
  const { selfieUri, setDocument } = store;
  const { isPhone } = useResponsive();
  const [uploading, setUploading] = useState(false);
  const [localPreviewUri, setLocalPreviewUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operation = useApplicationOperation(() => setUploading(false));
  const draftBusy = useApplicationSession(state => state.busy);

  const takeSelfie = async (): Promise<void> => {
    if (uploading) return;
    const isCurrent = operation.begin();
    if (!isCurrent) return;
    setUploading(true);
    setError(null);
    try {
      const capture = await captureImageAsync({ quality: 0.8, allowsEditing: false });
      if (!isCurrent()) return;
      if (capture.status === 'denied') {
        setError('Camera access is needed to take a selfie. Allow access and try again.');
        return;
      }
      const { result } = capture;
      if (result.canceled || result.assets.length === 0) return;
      const localUri = result.assets[0]!.uri;
      const uploaded = await uploadImages([localUri], 'onboarding', isCurrent);
      if (!isCurrent()) return;
      const reference = uploaded[0]?.url;
      if (!reference) throw new Error('Upload returned no selfie');
      setDocument('selfieUri', reference);
      setLocalPreviewUri(localUri);
    } catch {
      if (isCurrent()) setError('Your selfie could not be uploaded. Any previous selfie is unchanged. Please try again.');
    } finally {
      if (isCurrent()) setUploading(false);
    }
  };

  const captureButtonLabel = selfieUri
    ? isCameraCaptureAvailable() ? 'Retake Selfie' : 'Replace Selfie'
    : isCameraCaptureAvailable() ? 'Take Selfie' : 'Upload Selfie';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.progress}>
          <View style={[styles.progressDot, styles.progressDone]} />
          <View style={[styles.progressDot, styles.progressDone]} />
          <View style={[styles.progressDot, styles.progressDone]} />
          <View style={[styles.progressDot, styles.progressDone]} />
          <View style={[styles.progressDot, styles.progressActive]} />
          <View style={styles.progressDot} />
        </View>
        <Text style={styles.step}>5 / 6</Text>
      </View>

      <ScrollView style={styles.bodyScroll} contentContainerStyle={[styles.body, !isPhone && styles.bodyWide]}>
        <Text style={styles.title}>Selfie Verification</Text>
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
        <Text style={styles.subtitle}>
          Take a clear selfie of your face. This will be compared with your government ID
          to verify your identity. Make sure your face is well-lit and clearly visible.
        </Text>

        <View style={styles.selfieArea}>
          {uploading ? (
            <View style={styles.selfiePlaceholder}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.uploadingText}>Selecting or uploading…</Text>
            </View>
          ) : localPreviewUri ? (
            <Image source={{ uri: localPreviewUri }} style={styles.selfieImage} testID="selfie-local-preview" />
          ) : selfieUri ? (
            <View style={[styles.selfiePlaceholder, styles.selfieOnFile]}>
              <Check size={48} color={colors.success} />
              <Text style={styles.selfieOnFileTitle}>Selfie on file</Text>
              <Text style={styles.selfieHint}>Stored privately for identity review</Text>
            </View>
          ) : (
            <View style={styles.selfiePlaceholder}>
              <Camera size={48} color={colors.textTertiary} style={styles.selfieIcon} />
              <Text style={styles.selfieHint}>No selfie taken yet</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.captureBtn}
          onPress={takeSelfie}
          activeOpacity={0.7}
          disabled={uploading || draftBusy}
          accessibilityRole="button"
          accessibilityLabel={captureButtonLabel}
          accessibilityState={{ disabled: uploading || draftBusy, busy: uploading }}
        >
          <Text style={styles.captureBtnText}>{captureButtonLabel}</Text>
        </TouchableOpacity>

        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>Tips for a good selfie</Text>
          <Text style={styles.tipItem}>• Face the camera directly, no angles</Text>
          <Text style={styles.tipItem}>• Remove sunglasses and hats</Text>
          <Text style={styles.tipItem}>• Use good lighting (natural light works best)</Text>
          <Text style={styles.tipItem}>• Keep your face centered in the frame</Text>
        </View>
      <View style={styles.footer}>
        <View style={styles.footerInner}>
          <ProviderApplicationDraftActions fields={applicationFieldsFromStore(store)} disabled={uploading}
            continueDisabled={!selfieUri} onContinue={() => router.push(Routes.PROVIDER_ONBOARDING.TERMS)} />
        </View>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  progress: { flexDirection: 'row', flex: 1, justifyContent: 'center', gap: spacing.xs },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  progressDone: { backgroundColor: colors.success },
  progressActive: { backgroundColor: colors.primary, width: 24 },
  step: { ...typography.caption, color: colors.textTertiary, marginLeft: spacing.sm },
  bodyScroll: { flex: 1 },
  body: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
  bodyWide: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  title: { ...typography.h2, color: colors.text, marginBottom: spacing.xs },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  selfieArea: { alignItems: 'center', marginBottom: spacing.lg },
  selfiePlaceholder: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 3,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selfieImage: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 3,
    borderColor: colors.success,
  },
  selfieOnFile: { borderColor: colors.success, backgroundColor: colors.successLight },
  selfieOnFileTitle: { ...typography.body, color: colors.success, fontWeight: '700', marginTop: spacing.sm },
  selfieIcon: { marginBottom: spacing.sm },
  selfieHint: { ...typography.caption, color: colors.textTertiary },
  uploadingText: { ...typography.caption, color: colors.primary, marginTop: spacing.sm },
  error: { ...typography.bodySmall, color: colors.error, marginBottom: spacing.sm },
  captureBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.base,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  captureBtnText: { ...typography.button, color: colors.primary },
  tipsCard: {
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  tipsTitle: { ...typography.body, fontWeight: '700', color: colors.warning, marginBottom: spacing.sm },
  tipItem: { ...typography.bodySmall, color: colors.warning, marginBottom: 4, lineHeight: 18 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  footerInner: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: spacing.base, paddingVertical: spacing.md },
});
