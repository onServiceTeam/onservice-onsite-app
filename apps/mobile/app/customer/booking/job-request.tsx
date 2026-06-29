import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBookingStore } from '@/stores/booking.store';
import { createJobRequest, getSubcategoryIntakeFields, type IntakeField } from '@/services/booking.service';
import { getErrorMessage } from '@/utils/errors';
import { useImagePicker } from '@/hooks/useImagePicker';
import { colors, spacing, borderRadius } from '@/config/theme';
import { ChevronLeft, ChevronRight } from '@/components/icons';
// A7 — toast feedback instead of modal alerts.
import { showToast } from '@/lib/toast';
import { platformConfig } from '@/config/platform.config';
import { Routes } from '@/config/navigation';

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

  // D27 Phase 2 — per-subcategory structured intake. Fields are configured by
  // admins per service subcategory; the customer answers them so providers can
  // quote accurately (area in sqm, material, # of rooms, etc.). `intakeAnswers`
  // holds typed values keyed by field_key; `numberText` holds the raw display
  // string for number fields so partial typing ("12.") doesn't get clobbered.
  const [intakeAnswers, setIntakeAnswers] = useState<Record<string, string | number | boolean>>({});
  const [numberText, setNumberText] = useState<Record<string, string>>({});

  const fieldsQuery = useQuery({
    queryKey: ['intake-fields', draft.subcategoryId],
    queryFn: () => getSubcategoryIntakeFields(draft.subcategoryId as string),
    enabled: !!draft.subcategoryId,
    staleTime: 5 * 60 * 1000,
  });
  const intakeFields: IntakeField[] = fieldsQuery.data ?? [];

  const setAnswer = (key: string, value: string | number | boolean | undefined) => {
    setIntakeAnswers((prev) => {
      const next = { ...prev };
      if (value === undefined || value === '') delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const onNumberChange = (key: string, text: string) => {
    // allow digits and a single decimal point only
    const cleaned = text.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setNumberText((prev) => ({ ...prev, [key]: cleaned }));
    const n = Number(cleaned);
    setIntakeAnswers((prev) => {
      const next = { ...prev };
      if (cleaned === '' || !Number.isFinite(n)) delete next[key];
      else next[key] = n;
      return next;
    });
  };

  // Every required field must have a usable answer before submit is allowed.
  const intakeComplete = intakeFields.every((f) => {
    if (!f.isRequired) return true;
    const v = intakeAnswers[f.fieldKey];
    if (f.fieldType === 'number') return typeof v === 'number' && Number.isFinite(v);
    if (f.fieldType === 'boolean') return typeof v === 'boolean';
    return typeof v === 'string' && v.trim().length > 0;
  });

  const renderIntakeInput = (f: IntakeField): React.ReactElement => {
    if (f.fieldType === 'number') {
      return (
        <View style={styles.intakeNumberRow}>
          <TextInput
            style={[styles.intakeInput, { flex: 1 }]}
            keyboardType="numeric"
            value={numberText[f.fieldKey] ?? ''}
            onChangeText={(t) => onNumberChange(f.fieldKey, t)}
            placeholder={f.placeholder ?? 'Enter a number'}
            placeholderTextColor={colors.textTertiary}
          />
          {f.unit ? <Text style={styles.intakeUnit}>{f.unit}</Text> : null}
        </View>
      );
    }
    if (f.fieldType === 'text') {
      const v = intakeAnswers[f.fieldKey];
      return (
        <TextInput
          style={styles.intakeInput}
          value={typeof v === 'string' ? v : ''}
          onChangeText={(t) => setAnswer(f.fieldKey, t)}
          placeholder={f.placeholder ?? ''}
          placeholderTextColor={colors.textTertiary}
          maxLength={200}
        />
      );
    }
    if (f.fieldType === 'choice') {
      return (
        <View style={styles.chipRow}>
          {(f.options ?? []).map((opt) => {
            const selected = intakeAnswers[f.fieldKey] === opt;
            return (
              <TouchableOpacity
                key={opt}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setAnswer(f.fieldKey, opt)}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }
    // boolean
    return (
      <View style={styles.chipRow}>
        {[{ label: 'Yes', val: true }, { label: 'No', val: false }].map((o) => {
          const selected = intakeAnswers[f.fieldKey] === o.val;
          return (
            <TouchableOpacity
              key={o.label}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => setAnswer(f.fieldKey, o.val)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

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
        intakeAnswers: Object.keys(intakeAnswers).length > 0 ? intakeAnswers : undefined,
      });
    },
    onSuccess: (booking) => {
      showToast('Job request submitted. Providers will send quotes soon.', 'success');
      router.replace(`/customer/booking/${booking.id}`);
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      showToast(getErrorMessage(err, 'Could not submit request.'), 'error');
    },
  });

  const hasMinPhotos = imagePicker.localUris.length >= 2;
  // BUG-PHASE71-02 fix — pre-fix budgetMin > budgetMax silently submitted
  // (server might have its own validators but client should fail fast).
  const minNum = budgetMin ? Number(budgetMin) : NaN;
  const maxNum = budgetMax ? Number(budgetMax) : NaN;
  const budgetValid =
    (!budgetMin && !budgetMax) ||
    (Number.isFinite(minNum) && Number.isFinite(maxNum) && minNum <= maxNum) ||
    (Number.isFinite(minNum) && !budgetMax) ||
    (Number.isFinite(maxNum) && !budgetMin);
  const isValid =
    description.length >= 50 &&
    draft.categoryId &&
    draft.address &&
    hasMinPhotos &&
    budgetValid &&
    intakeComplete;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.text} />
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

        {/* D27 Phase 2 — structured job details, configured per subcategory in
            admin. Renders nothing when the subcategory has no intake fields. */}
        {fieldsQuery.isLoading && !!draft.subcategoryId && (
          <View style={styles.section}>
            <ActivityIndicator size="small" color={colors.info} />
          </View>
        )}
        {intakeFields.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Job Details</Text>
            <Text style={styles.hint}>These help providers send you an accurate quote.</Text>
            {intakeFields.map((f) => (
              <View key={f.id} style={styles.intakeField}>
                <Text style={styles.intakeLabel}>
                  {f.label}
                  {f.isRequired ? ' *' : ''}
                </Text>
                {f.helpText ? <Text style={styles.intakeHelp}>{f.helpText}</Text> : null}
                {renderIntakeInput(f)}
              </View>
            ))}
          </View>
        )}

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
          <Text style={styles.sectionTitle}>Location *</Text>
          {/* BUG-PHASE71-01 fix — pre-fix this card showed "No address
              selected" with no way to set one. Quote-based subcategory
              flow resets the booking-store address (booking.store.ts
              setSubcategory clears address/barangay/city/province), so
              users landing here from /customer/category/[slug] for a
              quote-based service had no address and the submit button
              just silently disabled — they were stuck. Now the card is
              tappable and routes to the address picker. */}
          <TouchableOpacity
            style={styles.addressCard}
            onPress={() => router.push(Routes.CUSTOMER.ADDRESS_PICKER)}
            activeOpacity={0.7}
            testID="job-request-address-picker"
          >
            <Text style={styles.addressText}>
              {draft.address
                ? [draft.address, draft.barangay, draft.city, draft.province].filter(Boolean).join(', ')
                : 'No address selected — tap to choose'}
            </Text>
            <ChevronRight size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {!budgetValid && (
          <View style={styles.section}>
            <Text style={[styles.hint, { color: colors.error }]}>
              Maximum budget must be greater than or equal to minimum.
            </Text>
          </View>
        )}

        {!intakeComplete && intakeFields.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.hint, { color: colors.error }]}>
              Please answer all required job-detail fields (marked *).
            </Text>
          </View>
        )}

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
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 6 },
  hint: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm },
  categoryCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  categoryName: { fontSize: 15, fontWeight: '600', color: colors.text },
  subcategoryName: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  textArea: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, fontSize: 14, color: colors.text, minHeight: 120 },
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
  urgencyOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: spacing.sm, gap: spacing.md },
  urgencySelected: { borderColor: colors.info, backgroundColor: colors.primaryLight },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  radioSelected: { borderColor: colors.info, backgroundColor: colors.info },
  urgencyLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  urgencyLabelSelected: { color: colors.info },
  urgencyDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  budgetField: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: spacing.md },
  budgetPrefix: { fontSize: 14, color: colors.textSecondary, marginRight: spacing.xs },
  budgetInput: { flex: 1, paddingVertical: spacing.md, fontSize: 14, color: colors.text },
  budgetDash: { fontSize: 16, color: colors.textTertiary },
  intakeField: { marginBottom: spacing.md },
  intakeLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 4 },
  intakeHelp: { fontSize: 12, color: colors.textSecondary, marginBottom: 6 },
  intakeInput: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, fontSize: 14, color: colors.text },
  intakeNumberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  intakeUnit: { fontSize: 14, color: colors.textSecondary, minWidth: 36 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipSelected: { borderColor: colors.info, backgroundColor: colors.primaryLight },
  chipText: { fontSize: 13, color: colors.text },
  chipTextSelected: { color: colors.info, fontWeight: '600' },
  addressCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  addressText: { fontSize: 14, color: colors.text, flex: 1 },
  addressArrow: { fontSize: 20, color: colors.textTertiary },
  submitBtn: { backgroundColor: colors.text, borderRadius: borderRadius.lg, paddingVertical: spacing.base, alignItems: 'center', marginTop: spacing.sm },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },
  footer: { fontSize: 12, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.md },
});
