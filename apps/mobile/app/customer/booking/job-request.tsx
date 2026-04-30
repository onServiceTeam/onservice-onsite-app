import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBookingStore } from '@/stores/booking.store';
import { createJobRequest } from '@/services/booking.service';
import { useImagePicker } from '@/hooks/useImagePicker';
import { colors, spacing, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';

const URGENCY_OPTIONS = [
  { value: 'same_day' as const, label: 'Same Day', desc: 'Within 4 hours' },
  { value: 'within_3_days' as const, label: 'Within 3 Days', desc: 'Flexible scheduling' },
  { value: 'within_a_week' as const, label: 'Within a Week', desc: 'No rush' },
  { value: 'flexible' as const, label: 'Flexible', desc: 'Provider suggests time' },
];

export default function JobRequestScreen(): React.ReactElement {
  const router = useRouter();
  const draft = useBookingStore((s) => s.draft);

  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<'same_day' | 'within_3_days' | 'within_a_week' | 'flexible'>('within_3_days');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const imagePicker = useImagePicker({ context: 'job-request', maxImages: 10 });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!draft.categoryId || !draft.address) {
        throw new Error('Missing category or address');
      }
      const uploadedUrls = await imagePicker.uploadAll();
      return createJobRequest({
        categoryId: draft.categoryId,
        subcategoryId: draft.subcategoryId ?? undefined,
        description,
        address: draft.address,
        barangay: draft.barangay ?? '',
        city: draft.city ?? '',
        province: draft.province ?? '',
        latitude: draft.latitude ?? undefined,
        longitude: draft.longitude ?? undefined,
        urgency,
        budgetMin: budgetMin ? Math.round(Number(budgetMin) * 100) : undefined,
        budgetMax: budgetMax ? Math.round(Number(budgetMax) * 100) : undefined,
        jobPhotos: uploadedUrls.length > 0 ? uploadedUrls : undefined,
      });
    },
    onSuccess: (booking) => {
      Alert.alert('Success', 'Your job request has been submitted. Providers will send quotes soon.', [
        { text: 'OK', onPress: () => router.replace(`/customer/booking/${booking.id}`) },
      ]);
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      Alert.alert('Error', axErr?.response?.data?.error?.message ?? axErr?.message ?? 'Could not submit request.');
    },
  });

  const hasMinPhotos = imagePicker.localUris.length >= 2;
  const isValid = description.length >= 50 && draft.categoryId && draft.address && hasMinPhotos;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Request Custom Quote</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Service Category</Text>
          <View style={styles.categoryCard}>
            <Text style={styles.categoryName}>{draft.categoryName ?? 'Not selected'}</Text>
            {draft.subcategoryName && (
              <Text style={styles.subcategoryName}>{draft.subcategoryName}</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Describe the Job *</Text>
          <Text style={styles.hint}>Minimum 50 characters. Be specific about the problem.</Text>
          <TextInput
            style={[styles.textArea, description.length > 0 && description.length < 50 && styles.inputError]}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the issue in detail. What needs to be done? What materials might be needed?"
            placeholderTextColor={colors.textTertiary}
            maxLength={2000}
          />
          <Text style={[styles.charCount, description.length < 50 ? styles.charCountRed : styles.charCountGreen]}>
            {description.length}/50 min
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photos *</Text>
          <Text style={styles.hint}>At least 2 photos required (max 10). Show the job site and issue clearly.</Text>
          <View style={styles.photoGrid}>
            {imagePicker.localUris.map((uri, i) => (
              <View key={uri} style={styles.photoThumb}>
                <Image source={{ uri }} style={styles.photoImage} />
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => imagePicker.removeImage(i)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.removeBtnText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
            {imagePicker.localUris.length < 10 && (
              <TouchableOpacity
                style={[styles.photoThumb, styles.addPhotoBtn]}
                onPress={imagePicker.showPickerOptions}
              >
                <Text style={styles.addPhotoIcon}>+</Text>
                <Text style={styles.addPhotoText}>Add Photo</Text>
              </TouchableOpacity>
            )}
          </View>
          {imagePicker.isUploading && (
            <View style={styles.uploadingRow}>
              <ActivityIndicator size="small" color={colors.info} />
              <Text style={styles.uploadingText}>Uploading photos...</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Urgency</Text>
          {URGENCY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.urgencyOption, urgency === opt.value && styles.urgencySelected]}
              onPress={() => setUrgency(opt.value)}
            >
              <View style={[styles.radio, urgency === opt.value && styles.radioSelected]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.urgencyLabel, urgency === opt.value && styles.urgencyLabelSelected]}>
                  {opt.label}
                </Text>
                <Text style={styles.urgencyDesc}>{opt.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Budget Range (optional)</Text>
          <Text style={styles.hint}>Helps providers understand your expectations</Text>
          <View style={styles.budgetRow}>
            <View style={styles.budgetField}>
              <Text style={styles.budgetPrefix}>{platformConfig.currencySymbol}</Text>
              <TextInput
                style={styles.budgetInput}
                keyboardType="numeric"
                value={budgetMin}
                onChangeText={setBudgetMin}
                placeholder="Min"
                placeholderTextColor={colors.textTertiary}
              />
            </View>
            <Text style={styles.budgetDash}>—</Text>
            <View style={styles.budgetField}>
              <Text style={styles.budgetPrefix}>{platformConfig.currencySymbol}</Text>
              <TextInput
                style={styles.budgetInput}
                keyboardType="numeric"
                value={budgetMax}
                onChangeText={setBudgetMax}
                placeholder="Max"
                placeholderTextColor={colors.textTertiary}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          <View style={styles.addressCard}>
            <Text style={styles.addressText}>
              {draft.address
                ? [draft.address, draft.barangay, draft.city, draft.province].filter(Boolean).join(', ')
                : 'No address selected'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, !isValid && styles.submitBtnDisabled]}
          onPress={() => mutation.mutate()}
          disabled={!isValid || mutation.isPending}
        >
          {mutation.isPending ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.submitBtnText}>Submit Job Request</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footer}>
          Up to 5 providers will send you quotes. You can compare and choose the best one.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 6 },
  hint: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm },
  categoryCard: { backgroundColor: colors.white, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  categoryName: { fontSize: 15, fontWeight: '600', color: colors.text },
  subcategoryName: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  textArea: { backgroundColor: colors.white, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.text, minHeight: 120 },
  inputError: { borderColor: colors.error },
  charCount: { fontSize: 12, marginTop: spacing.xs, textAlign: 'right' },
  charCountRed: { color: colors.error },
  charCountGreen: { color: colors.success },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoThumb: { width: 80, height: 80, borderRadius: borderRadius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  photoImage: { width: '100%', height: '100%', borderRadius: 9 },
  removeBtn: { position: 'absolute', top: 2, right: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { color: colors.white, fontSize: 14, fontWeight: '700', lineHeight: 16 },
  addPhotoBtn: { borderStyle: 'dashed', borderColor: colors.info, alignItems: 'center', justifyContent: 'center' },
  addPhotoIcon: { fontSize: 24, color: colors.info },
  addPhotoText: { fontSize: 10, color: colors.info, marginTop: 2 },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  uploadingText: { fontSize: 13, color: colors.info },
  urgencyOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm, gap: spacing.md },
  urgencySelected: { borderColor: colors.info, backgroundColor: colors.primaryLight },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  radioSelected: { borderColor: colors.info, backgroundColor: colors.info },
  urgencyLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  urgencyLabelSelected: { color: colors.info },
  urgencyDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  budgetField: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  budgetPrefix: { fontSize: 14, color: colors.textSecondary, marginRight: spacing.xs },
  budgetInput: { flex: 1, paddingVertical: spacing.md, fontSize: 14, color: colors.text },
  budgetDash: { fontSize: 16, color: colors.textTertiary },
  addressCard: { backgroundColor: colors.white, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  addressText: { fontSize: 14, color: colors.text },
  submitBtn: { backgroundColor: colors.text, borderRadius: borderRadius.lg, paddingVertical: spacing.base, alignItems: 'center', marginTop: spacing.sm },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },
  footer: { fontSize: 12, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.md },
});
