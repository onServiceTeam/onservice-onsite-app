import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { uploadImages } from '@/services/upload.service';
import { Button } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

type DocField = 'governmentIdFrontUri' | 'governmentIdBackUri' | 'nbiClearanceUri';

interface DocSlot {
  field: DocField;
  label: string;
  hint: string;
}

const DOC_SLOTS: DocSlot[] = [
  { field: 'governmentIdFrontUri', label: 'Government ID — Front', hint: 'National ID, Passport, Driver\'s License, or UMID' },
  { field: 'governmentIdBackUri', label: 'Government ID — Back', hint: 'Back side of the same government ID' },
  { field: 'nbiClearanceUri', label: 'NBI Clearance', hint: 'Must be issued within the last 6 months' },
];

export default function DocumentsScreen(): React.ReactElement {
  const router = useRouter();
  const store = useOnboardingStore();
  const [uploading, setUploading] = useState<DocField | null>(null);

  const pickAndUpload = async (field: DocField): Promise<void> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Photo library access is needed to upload documents.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.8,
    });

    if (result.canceled || result.assets.length === 0) return;

    setUploading(field);
    try {
      const uploaded = await uploadImages([result.assets[0]!.uri], 'onboarding');
      store.setDocument(field, uploaded[0]!.url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      Alert.alert('Upload Error', msg);
    } finally {
      setUploading(null);
    }
  };

  const allUploaded =
    !!store.governmentIdFrontUri && !!store.governmentIdBackUri && !!store.nbiClearanceUri;

  const handleNext = (): void => {
    if (!allUploaded) {
      Alert.alert('Required', 'Please upload all three documents to continue.');
      return;
    }
    router.push('/provider-onboarding/selfie');
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
          <View style={[styles.progressDot, styles.progressActive]} />
          <View style={styles.progressDot} />
          <View style={styles.progressDot} />
        </View>
        <Text style={styles.step}>3 / 5</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>Verification Documents</Text>
        <Text style={styles.subtitle}>
          Upload your government ID and NBI clearance for identity verification.
          Documents are encrypted and stored securely.
        </Text>

        {DOC_SLOTS.map(({ field, label, hint }) => {
          const uri = store[field];
          const isLoading = uploading === field;

          return (
            <TouchableOpacity
              key={field}
              style={[styles.docSlot, uri && styles.docSlotDone]}
              onPress={() => pickAndUpload(field)}
              activeOpacity={0.7}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : uri ? (
                <Image source={{ uri }} style={styles.docThumb} />
              ) : (
                <View style={styles.docPlaceholder}>
                  <Text style={styles.docPlaceholderIcon}>📄</Text>
                </View>
              )}
              <View style={styles.docInfo}>
                <Text style={styles.docLabel}>{label}</Text>
                <Text style={styles.docHint}>{hint}</Text>
              </View>
              <Text style={[styles.docStatus, uri && styles.docStatusDone]}>
                {uri ? '✓' : 'Upload'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Button title="Next" onPress={handleNext} disabled={!allUploaded} />
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
  backBtn: { padding: spacing.xs, marginRight: spacing.sm },
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
  docSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  docSlotDone: { borderColor: colors.success },
  docThumb: { width: 48, height: 48, borderRadius: borderRadius.md, marginRight: spacing.base },
  docPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.base,
  },
  docPlaceholderIcon: { fontSize: 20 },
  docInfo: { flex: 1 },
  docLabel: { ...typography.body, fontWeight: '600', color: colors.text, marginBottom: 2 },
  docHint: { ...typography.caption, color: colors.textTertiary, lineHeight: 16 },
  docStatus: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },
  docStatusDone: { color: colors.success },
  footer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
