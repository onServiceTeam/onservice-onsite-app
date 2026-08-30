import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
// Phase K MED-K07 fix — capture optional NBI expiry date + ID number
// during onboarding. Pre-fix the only NBI metadata captured was the
// image URL; admins had to OCR the photo to backfill the
// providers.nbi_expiry_date column the NbiStatusBanner depends on.
// Post-fix: two optional text inputs below the document slots feed
// the onboarding store; terms.tsx submit forwards them to
// /providers/apply (validator + service updated in this same fix).
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Image, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { uploadImages } from '@/services/upload.service';
import { Button } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Check, FileText } from '@/components/icons';

import { Routes } from '@/config/navigation';
import { useResponsive } from '@/hooks/useResponsive';
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
  const { isPhone } = useResponsive();
  const [uploading, setUploading] = useState<DocField | null>(null);
  const [localPreviews, setLocalPreviews] = useState<Partial<Record<DocField, string>>>({});

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
      const localUri = result.assets[0]!.uri;
      const uploaded = await uploadImages([localUri], 'onboarding');
      store.setDocument(field, uploaded[0]!.url);
      setLocalPreviews((current) => ({ ...current, [field]: localUri }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      Alert.alert('Upload Error', msg);
    } finally {
      setUploading(null);
    }
  };

  const allUploaded =
    !!store.governmentIdFrontUri && !!store.governmentIdBackUri && !!store.nbiClearanceUri;
  const uploadedCount = DOC_SLOTS.filter(({ field }) => !!store[field]).length;

  const handleNext = (): void => {
    if (!allUploaded) {
      Alert.alert('Required', 'Please upload all three documents to continue.');
      return;
    }
    // BUG-PHASE62-01 fix — pre-fix the optional NBI Expiry / Gov ID
    // Number TextInputs accepted any string and forwarded raw to
    // /providers/apply during terms.tsx submit. Server Zod validators
    // reject non-YYYY-MM-DD with a generic 400 the user can't easily
    // map back to a field two screens away. Same pattern as the
    // Provider Certifications fix in Phase 60 (BUG-PHASE60-01). Now:
    // catch the format issue here, before the user advances.
    const expiry = (store.nbiExpiryDate ?? '').trim();
    if (expiry.length > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
      Alert.alert(
        'Invalid Expiry Date',
        'NBI expiry date must be in YYYY-MM-DD format (e.g. 2027-01-15) or left blank.',
      );
      return;
    }
    if (expiry.length > 0) {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
      if (expiry < today) {
        Alert.alert(
          'Expired NBI',
          'The NBI expiry date is in the past. NBI clearance must be valid (issued within 6 months).',
        );
        return;
      }
    }
    router.push(Routes.PROVIDER_ONBOARDING.SELFIE);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back to provider vetting"
        >
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.progress}>
          <View style={[styles.progressDot, styles.progressDone]} />
          <View style={[styles.progressDot, styles.progressDone]} />
          <View style={[styles.progressDot, styles.progressDone]} />
          <View style={[styles.progressDot, styles.progressActive]} />
          <View style={styles.progressDot} />
          <View style={styles.progressDot} />
        </View>
        <Text style={styles.step}>4 / 6</Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Verification Documents</Text>
        <Text style={styles.subtitle}>
          Upload your government ID and NBI clearance for identity verification.
          These files stay in the private verification area and are available only through authorized review.
        </Text>

        <View
          style={styles.readinessCard}
          accessibilityRole="summary"
          accessibilityLabel={`${uploadedCount} of 3 verification documents ready. Review has not started.`}
        >
          <View style={styles.readinessCount}>
            <Text style={styles.readinessNumber}>{uploadedCount} / 3</Text>
            <Text style={styles.readinessLabel}>documents ready</Text>
          </View>
          <View style={styles.readinessCopy}>
            <Text style={styles.readinessTitle}>{allUploaded ? 'Ready for the next step' : 'Finish all required uploads'}</Text>
            <Text style={styles.readinessText}>
              Review has not started. Your application is submitted only after you finish all six onboarding steps.
            </Text>
          </View>
        </View>

        <View
          style={[styles.workspace, !isPhone && styles.workspaceWide]}
          accessibilityLabel={isPhone ? 'Phone verification document workspace' : 'Tablet and desktop verification document workspace'}
        >
          <View style={styles.documentsColumn}>
            <Text style={styles.sectionTitle}>Required documents</Text>
            <Text style={styles.sectionHint}>Tap any row to choose or replace that file.</Text>
            {DOC_SLOTS.map(({ field, label, hint }) => {
              const uri = store[field];
              const localPreview = localPreviews[field];
              const isLoading = uploading === field;

              return (
                <TouchableOpacity
                  key={field}
                  style={[styles.docSlot, uri && styles.docSlotDone]}
                  onPress={() => pickAndUpload(field)}
                  activeOpacity={0.7}
                  disabled={isLoading}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}. ${isLoading ? 'Uploading' : uri ? 'On file. Tap to replace' : 'Required. Tap to upload'}`}
                  accessibilityState={{ disabled: isLoading, busy: isLoading }}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : localPreview ? (
                    <Image
                      source={{ uri: localPreview }}
                      style={styles.docThumb}
                      testID={`document-preview-${field}`}
                      accessibilityLabel={`${label} local preview`}
                    />
                  ) : (
                    <View style={[styles.docPlaceholder, uri && styles.docPlaceholderDone]}>
                      <FileText size={20} color={uri ? colors.success : colors.textTertiary} />
                    </View>
                  )}
                  <View style={styles.docInfo}>
                    <Text style={styles.docLabel}>{label}</Text>
                    <Text style={styles.docHint}>{hint}</Text>
                  </View>
                  {uri
                    ? <View style={styles.uploadedStatus}>
                        <Text style={styles.onFileText}>On file</Text>
                        <Check size={20} color={colors.success} accessibilityLabel="Uploaded and on file" />
                      </View>
                    : <Text style={styles.docStatus}>Upload</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.detailsCard}>
            <Text style={styles.sectionTitle}>Document details</Text>
            <Text style={styles.sectionHint}>Optional details help reviewers match the uploaded files.</Text>
            {/* Phase K MED-K07 fix — optional NBI expiry + ID number. */}
            {/* BUG-PHASE198-01 fix — pre-fix neither input had maxLength. */}
            <Text style={styles.fieldLabel}>NBI Expiry Date (optional)</Text>
            <Text style={styles.fieldHint}>Format: YYYY-MM-DD. Helps us warn you before it lapses.</Text>
            <TextInput
              style={styles.input}
              value={store.nbiExpiryDate ?? ''}
              onChangeText={(v) => store.setNbiExpiryDate(v.length === 0 ? null : v)}
              placeholder="2027-01-15"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              accessibilityLabel="NBI expiry date, optional"
            />
            <Text style={styles.fieldLabel}>Government ID Number (optional)</Text>
            <Text style={styles.fieldHint}>Speeds up admin review. Stored alongside the ID image.</Text>
            <TextInput
              style={styles.input}
              value={store.governmentIdNumber ?? ''}
              onChangeText={(v) => store.setGovernmentIdNumber(v.length === 0 ? null : v)}
              placeholder="e.g. 1234-5678-9012"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="characters"
              maxLength={64}
              accessibilityLabel="Government ID number, optional"
            />
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerInner}>
          <Button title="Next" onPress={handleNext} disabled={!allUploaded} />
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
  },
  bodyContent: {
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.lg,
  },
  bodyContentWide: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
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
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
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
  readinessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
    gap: spacing.base,
  },
  readinessCount: {
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  readinessNumber: { ...typography.h3, color: colors.primary },
  readinessLabel: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  readinessCopy: { flex: 1 },
  readinessTitle: { ...typography.body, color: colors.text, fontWeight: '700', marginBottom: spacing.xs },
  readinessText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },
  workspace: { width: '100%', gap: spacing.base },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  documentsColumn: { flex: 1.2, minWidth: 0 },
  detailsCard: {
    flex: 0.8,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  sectionHint: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.base },
  docPlaceholderDone: { backgroundColor: colors.successLight },
  docPlaceholderIcon: { fontSize: 20 },
  docInfo: { flex: 1 },
  docLabel: { ...typography.body, fontWeight: '600', color: colors.text, marginBottom: 2 },
  docHint: { ...typography.caption, color: colors.textTertiary, lineHeight: 16 },
  docStatus: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },
  docStatusDone: { color: colors.success },
  uploadedStatus: { alignItems: 'flex-end', gap: 2 },
  onFileText: { ...typography.caption, color: colors.success, fontWeight: '700' },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  footerInner: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  // Phase K MED-K07 styles.
  fieldLabel: { ...typography.body, fontWeight: '600', color: colors.text, marginTop: spacing.md, marginBottom: 2 },
  fieldHint: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.sm },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
});
