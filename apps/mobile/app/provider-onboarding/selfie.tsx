import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureImageAsync, isCameraCaptureAvailable } from '@/utils/image-capture';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { uploadImages } from '@/services/upload.service';
import { Button } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Camera } from '@/components/icons';

import { Routes } from '@/config/navigation';
export default function SelfieScreen(): React.ReactElement {
  const router = useRouter();
  const { selfieUri, setDocument } = useOnboardingStore();
  const [uploading, setUploading] = useState(false);

  const takeSelfie = async (): Promise<void> => {
    const capture = await captureImageAsync({ quality: 0.8, allowsEditing: false });
    if (capture.status === 'denied') {
      Alert.alert('Permission Required', 'Camera access is needed to take a selfie.');
      return;
    }

    const { result } = capture;
    if (result.canceled || result.assets.length === 0) return;

    setUploading(true);
    try {
      const uploaded = await uploadImages([result.assets[0]!.uri], 'onboarding');
      setDocument('selfieUri', uploaded[0]!.url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      Alert.alert('Upload Error', msg);
    } finally {
      setUploading(false);
    }
  };

  const handleNext = (): void => {
    if (!selfieUri) {
      Alert.alert('Required', 'Please take a selfie to continue.');
      return;
    }
    router.push(Routes.PROVIDER_ONBOARDING.TERMS);
  };

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
          <View style={[styles.progressDot, styles.progressActive]} />
          <View style={styles.progressDot} />
        </View>
        <Text style={styles.step}>4 / 5</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>Selfie Verification</Text>
        <Text style={styles.subtitle}>
          Take a clear selfie of your face. This will be compared with your government ID
          to verify your identity. Make sure your face is well-lit and clearly visible.
        </Text>

        <View style={styles.selfieArea}>
          {uploading ? (
            <View style={styles.selfiePlaceholder}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.uploadingText}>Uploading...</Text>
            </View>
          ) : selfieUri ? (
            <Image source={{ uri: selfieUri }} style={styles.selfieImage} />
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
          disabled={uploading}
        >
          <Text style={styles.captureBtnText}>
            {selfieUri
              ? isCameraCaptureAvailable() ? 'Retake Selfie' : 'Replace Selfie'
              : isCameraCaptureAvailable() ? 'Take Selfie' : 'Upload Selfie'}
          </Text>
        </TouchableOpacity>

        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>Tips for a good selfie</Text>
          <Text style={styles.tipItem}>• Face the camera directly, no angles</Text>
          <Text style={styles.tipItem}>• Remove sunglasses and hats</Text>
          <Text style={styles.tipItem}>• Use good lighting (natural light works best)</Text>
          <Text style={styles.tipItem}>• Keep your face centered in the frame</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Button title="Next" onPress={handleNext} disabled={!selfieUri} />
      </View>
    </SafeAreaView>
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
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  progress: { flexDirection: 'row', flex: 1, justifyContent: 'center', gap: spacing.xs },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  progressDone: { backgroundColor: colors.success },
  progressActive: { backgroundColor: colors.primary, width: 24 },
  step: { ...typography.caption, color: colors.textTertiary, marginLeft: spacing.sm },
  body: {
    flex: 1,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
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
  selfieIcon: { marginBottom: spacing.sm },
  selfieHint: { ...typography.caption, color: colors.textTertiary },
  uploadingText: { ...typography.caption, color: colors.primary, marginTop: spacing.sm },
  captureBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.base,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  captureBtnText: { ...typography.button, color: colors.white },
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
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
