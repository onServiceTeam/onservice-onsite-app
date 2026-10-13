import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
//
// D38 human audit (Ken, 2026-10-13): "Book a service". Every service starts
// here: the customer describes the job in any mix of quick questions, text and
// photos, adds a budget range or says they are not sure, then picks when and
// where. Local pros send the price. No single item is required; the request
// needs a description of 10+ characters, a photo, or an answered question,
// which is the same rule the API enforces (validators/booking.validators.ts).
// Each part of the form is its own section card, so later media sections
// (video and voice notes, Milestone 2) slot in as further cards.
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBookingStore } from '@/stores/booking.store';
import { createJobRequest, getSubcategoryIntakeFields, type IntakeField } from '@/services/booking.service';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/errors';
import { useImagePicker } from '@/hooks/useImagePicker';
import { colors, spacing, borderRadius, typography } from '@/config/theme';
import {
  ChevronLeft, ChevronRight, ListChecks, PencilLine, Camera, Wallet, Clock, MapPin, Check, X, Plus,
} from '@/components/icons';
// A7 — toast feedback instead of modal alerts.
import { showToast } from '@/lib/toast';
import { platformConfig } from '@/config/platform.config';
import { buildRoute, Routes } from '@/config/navigation';
import { useResponsive } from '@/hooks/useResponsive';
import ServiceScopeNotice from '@/components/ServiceScopeNotice';
import { EmptyState, ErrorState } from '@/components/ui';
import { formatPHP } from '@/utils/currency';

const URGENCY_OPTIONS = [
  { value: 'same_day' as const, label: 'Same Day', desc: 'Within 4 hours' },
  { value: 'within_3_days' as const, label: 'Within 3 Days', desc: 'Flexible scheduling' },
  { value: 'within_a_week' as const, label: 'Within a Week', desc: 'No rush' },
  { value: 'flexible' as const, label: 'Flexible', desc: 'Provider suggests time' },
];

// D38 + brief: up to 6 photos (the API accepts up to 10 only so older APKs,
// whose form allowed 10, keep working), and a description only counts once
// it has 10 characters that are not spaces (same rule as createJobRequestSchema).
const MAX_PHOTOS = 6;
const MIN_DESCRIPTION_CHARS = 10;
// The wording only mentions quick questions when the service has some on
// screen; a service with no admin-written questions never asks for an answer.
const EMPTY_REQUEST_MESSAGE =
  'Tell the pro about the job: write at least 10 characters, add a photo, or answer a quick question.';
const EMPTY_REQUEST_MESSAGE_NO_QUESTIONS =
  'Tell the pro about the job: write at least 10 characters or add a photo.';
const DESCRIBE_HINT =
  'A few words, a photo or an answer above is enough. More detail helps the pro price it right.';
const DESCRIBE_HINT_NO_QUESTIONS =
  'A few words or a photo is enough. More detail helps the pro price it right.';

type Answer = string | number | boolean;

function isRealAnswer(value: Answer): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  return true;
}

interface PriceBounds {
  minCents: number | null;
  maxCents: number | null;
}

interface SectionCardProps {
  icon: React.ReactElement;
  title: string;
  hint?: string;
  children: React.ReactNode;
}

function SectionCard({ icon, title, hint, children }: SectionCardProps): React.ReactElement {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIcon}>{icon}</View>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle} accessibilityRole="header">{title}</Text>
          {hint ? <Text style={styles.cardHint}>{hint}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

function InlineError({ message }: { message: string }): React.ReactElement {
  return (
    <Text style={styles.inlineError} accessibilityLiveRegion="polite">
      {message}
    </Text>
  );
}

export default function JobRequestScreen(): React.ReactElement {
  const router = useRouter();
  const draft = useBookingStore((s) => s.draft);
  const { isPhone } = useResponsive();

  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<'same_day' | 'within_3_days' | 'within_a_week' | 'flexible'>('within_3_days');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [budgetUnsure, setBudgetUnsure] = useState(false);
  // Inline errors appear once the customer has tried to send.
  const [attempted, setAttempted] = useState(false);
  const imagePicker = useImagePicker({ context: 'job-request', maxImages: MAX_PHOTOS });

  // D27 Phase 2 — per-subcategory structured intake. Fields are configured by
  // admins per service subcategory; the customer answers them so providers can
  // quote accurately (area in sqm, material, # of rooms, etc.). `intakeAnswers`
  // holds typed values keyed by field_key; `numberText` holds the raw display
  // string for number fields so partial typing ("12.") doesn't get clobbered.
  const [intakeAnswers, setIntakeAnswers] = useState<Record<string, Answer>>({});
  const [numberText, setNumberText] = useState<Record<string, string>>({});

  const fieldsQuery = useQuery({
    queryKey: ['intake-fields', draft.subcategoryId],
    queryFn: () => getSubcategoryIntakeFields(draft.subcategoryId as string),
    enabled: !!draft.subcategoryId,
    staleTime: 5 * 60 * 1000,
  });
  const intakeFields: IntakeField[] = fieldsQuery.data ?? [];

  // Admin-set price range for this service, shown only as a guide.
  const boundsQuery = useQuery({
    queryKey: ['subcategory-price-bounds', draft.subcategoryId],
    queryFn: async (): Promise<PriceBounds | null> => {
      const res = await api.get<{ success: boolean; data?: PriceBounds }>(
        `/api/v1/catalog/subcategories/${draft.subcategoryId}/bounds`,
      );
      return res.data?.data ?? null;
    },
    enabled: !!draft.subcategoryId,
    staleTime: 10 * 60 * 1000,
  });
  const bounds = boundsQuery.data;
  const priceGuide = bounds
    && typeof bounds.minCents === 'number' && typeof bounds.maxCents === 'number'
    && bounds.minCents > 0 && bounds.maxCents >= bounds.minCents
    ? `onService price guide for this service: ${formatPHP(bounds.minCents)} to ${formatPHP(bounds.maxCents)}`
    : null;

  const setAnswer = (key: string, value: Answer | undefined): void => {
    setIntakeAnswers((prev) => {
      const next = { ...prev };
      if (value === undefined || value === '') delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const onNumberChange = (key: string, text: string): void => {
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

  // Admin-marked required questions still need an answer.
  const intakeComplete = intakeFields.every((f) => {
    if (!f.isRequired) return true;
    const v = intakeAnswers[f.fieldKey];
    if (f.fieldType === 'number') return typeof v === 'number' && Number.isFinite(v);
    if (f.fieldType === 'boolean') return typeof v === 'boolean';
    return typeof v === 'string' && v.trim().length > 0;
  });

  // "Not sure" clears and locks the budget inputs; the request then carries
  // no budget at all.
  const toggleBudgetUnsure = (): void => {
    const nextUnsure = !budgetUnsure;
    setBudgetUnsure(nextUnsure);
    if (nextUnsure) {
      setBudgetMin('');
      setBudgetMax('');
    }
  };

  const renderIntakeInput = (f: IntakeField): React.ReactElement => {
    if (f.fieldType === 'number') {
      return (
        <View style={styles.intakeNumberRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            keyboardType="numeric"
            value={numberText[f.fieldKey] ?? ''}
            onChangeText={(t) => onNumberChange(f.fieldKey, t)}
            placeholder={f.placeholder ?? 'Enter a number'}
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel={f.label}
          />
          {f.unit ? <Text style={styles.intakeUnit}>{f.unit}</Text> : null}
        </View>
      );
    }
    if (f.fieldType === 'text') {
      const v = intakeAnswers[f.fieldKey];
      return (
        <TextInput
          style={styles.input}
          value={typeof v === 'string' ? v : ''}
          onChangeText={(t) => setAnswer(f.fieldKey, t)}
          placeholder={f.placeholder ?? ''}
          placeholderTextColor={colors.textTertiary}
          maxLength={200}
          accessibilityLabel={f.label}
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
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${f.label}: ${opt}`}
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
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${f.label}: ${o.label}`}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // Budget: whole pesos on screen, centavos on the wire (the API and the
  // provider screens read centavos).
  const minPesos = budgetMin ? Number(budgetMin) : null;
  const maxPesos = budgetMax ? Number(budgetMax) : null;
  const budgetError = budgetUnsure
    ? null
    : (minPesos !== null && minPesos <= 0) || (maxPesos !== null && maxPesos <= 0)
      ? 'Budget amounts must be more than zero.'
      : minPesos !== null && maxPesos !== null && minPesos > maxPesos
        ? 'Maximum budget must be greater than or equal to minimum.'
        : null;

  const answeredQuestions = Object.fromEntries(
    Object.entries(intakeAnswers).filter(([, value]) => isRealAnswer(value)),
  ) as Record<string, Answer>;
  const hasDescription = description.replace(/\s/g, '').length >= MIN_DESCRIPTION_CHARS;
  const hasContent = hasDescription
    || imagePicker.localUris.length > 0
    || Object.keys(answeredQuestions).length > 0;
  const addressReady = !!draft.address && !!draft.barangay && draft.latitude != null && draft.longitude != null;
  // Fail closed while the service's questions are loading or failed to load.
  const questionsReady = !draft.subcategoryId || fieldsQuery.isSuccess;
  const canSend = hasContent && addressReady && !budgetError && intakeComplete && questionsReady;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!draft.categoryId || !draft.address || !draft.barangay || draft.latitude == null || draft.longitude == null) {
        throw new Error('Missing category or address');
      }
      if (draft.subcategoryId && !fieldsQuery.isSuccess) {
        throw new Error('Required job questions are not available yet');
      }
      const uploadedUrls = await imagePicker.uploadAll();
      return createJobRequest({
        categoryId: draft.categoryId,
        subcategoryId: draft.subcategoryId ?? undefined,
        description: description.trim(),
        address: draft.address,
        barangay: draft.barangay ?? '',
        city: draft.city ?? '',
        province: draft.province ?? '',
        latitude: draft.latitude,
        longitude: draft.longitude,
        urgency,
        budgetMin: !budgetUnsure && minPesos !== null ? Math.round(minPesos * 100) : undefined,
        budgetMax: !budgetUnsure && maxPesos !== null ? Math.round(maxPesos * 100) : undefined,
        jobPhotos: uploadedUrls.length > 0 ? uploadedUrls : undefined,
        intakeAnswers: Object.keys(answeredQuestions).length > 0 ? answeredQuestions : undefined,
      });
    },
    onSuccess: (booking) => {
      showToast('Request sent. Prices from pros will show on this request.', 'success');
      router.replace(buildRoute(Routes.CUSTOMER.BOOKING_DETAIL, { id: booking.id }));
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      showToast(getErrorMessage(err, 'Could not send your request.'), 'error');
    },
  });

  const onSend = (): void => {
    setAttempted(true);
    if (!canSend || mutation.isPending) return;
    mutation.mutate();
  };

  const serviceName = draft.subcategoryName || draft.categoryName || '';

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back from book a service">
        <ChevronLeft size={24} color={colors.text} />
      </TouchableOpacity>
      <View style={styles.headerText}>
        <Text style={styles.headerTitle} accessibilityRole="header">Book a service</Text>
        {serviceName ? <Text style={styles.headerSubtitle} numberOfLines={1}>{serviceName}</Text> : null}
      </View>
      <View style={styles.placeholder} />
    </View>
  );

  if (!draft.categoryId || !draft.categoryName) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <EmptyState
          title="Choose a service category first"
          description="Start from the service catalog so providers receive the correct scope and configured job questions."
          actionLabel="Browse services"
          onAction={() => router.replace(Routes.TABS.HOME)}
        />
      </SafeAreaView>
    );
  }

  const showQuestions = !!draft.subcategoryId && (fieldsQuery.isLoading || fieldsQuery.isError || intakeFields.length > 0);
  const hasQuestions = intakeFields.length > 0;
  const emptyRequestMessage = hasQuestions ? EMPTY_REQUEST_MESSAGE : EMPTY_REQUEST_MESSAGE_NO_QUESTIONS;
  const hasScope = !!draft.serviceDescription?.trim();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {header}

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View
          style={[styles.formContent, !isPhone && styles.formContentWide]}
          accessibilityLabel={isPhone ? 'Service request form' : 'Wide service request workspace'}
        >
          <View style={[styles.requestWorkspace, !isPhone && styles.requestWorkspaceWide]}>
            <View style={[styles.requestColumn, !isPhone && styles.requestPrimaryWide]}>
              {hasScope ? (
                <ServiceScopeNotice description={draft.serviceDescription} pricingType={draft.pricingType} />
              ) : null}

              {/* D27 Phase 2 — structured job details, configured per subcategory in
                  admin. Renders nothing when the subcategory has no questions. */}
              {showQuestions ? (
                <SectionCard
                  icon={<ListChecks size={20} color={colors.primary} />}
                  title="Quick questions"
                  hint="These help the pro price the job."
                >
                  {fieldsQuery.isLoading ? <ActivityIndicator size="small" color={colors.info} /> : null}
                  {fieldsQuery.isError ? (
                    <ErrorState
                      compact
                      title="Job questions unavailable"
                      message="We could not load the service questions providers need for an accurate quote. Try again before submitting this request."
                      onRetry={() => fieldsQuery.refetch()}
                    />
                  ) : null}
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
                  {attempted && !intakeComplete && intakeFields.length > 0 ? (
                    <InlineError message="Please answer the required questions (marked *)." />
                  ) : null}
                </SectionCard>
              ) : null}

              <SectionCard
                icon={<PencilLine size={20} color={colors.primary} />}
                title="Describe the job"
                hint={hasQuestions ? DESCRIBE_HINT : DESCRIBE_HINT_NO_QUESTIONS}
              >
                <TextInput
                  style={[styles.textArea, attempted && !hasContent && styles.inputError]}
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What is wrong, what do you need done, anything the pro should know"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={2000}
                  accessibilityLabel="Describe the job"
                />
                {attempted && !hasContent ? <InlineError message={emptyRequestMessage} /> : null}
              </SectionCard>

              <SectionCard
                icon={<Camera size={20} color={colors.primary} />}
                title={`Photos (optional, up to ${MAX_PHOTOS})`}
                hint="Show the problem and the area around it."
              >
                <View style={styles.photoGrid}>
                  {imagePicker.localUris.map((uri, i) => (
                    <View key={uri} style={styles.photoThumb}>
                      <Image source={{ uri }} style={styles.photoImage} accessibilityLabel={`Job photo ${i + 1}`} />
                      <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={() => imagePicker.removeImage(i)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove job photo ${i + 1}`}
                      >
                        <X size={14} color={colors.white} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {imagePicker.localUris.length < MAX_PHOTOS && (
                    <TouchableOpacity
                      style={[styles.photoThumb, styles.addPhotoBtn]}
                      onPress={imagePicker.showPickerOptions}
                      accessibilityRole="button"
                      accessibilityLabel="Add a job photo"
                    >
                      <Plus size={22} color={colors.primary} />
                      <Text style={styles.addPhotoText}>Add photo</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {imagePicker.isUploading && (
                  <View style={styles.uploadingRow}>
                    <ActivityIndicator size="small" color={colors.info} />
                    <Text style={styles.uploadingText}>Uploading photos...</Text>
                  </View>
                )}
              </SectionCard>
            </View>

            <View style={[styles.requestColumn, !isPhone && styles.requestSecondaryWide]}>
              <SectionCard
                icon={<Wallet size={20} color={colors.primary} />}
                title="Your budget"
                hint="Pros see your budget before they send a price."
              >
                <View style={styles.budgetRow}>
                  <View style={[styles.budgetField, budgetUnsure && styles.budgetFieldOff]}>
                    <Text style={styles.budgetPrefix}>{platformConfig.currencySymbol}</Text>
                    <TextInput
                      style={styles.budgetInput}
                      keyboardType="numeric"
                      value={budgetMin}
                      onChangeText={(t) => setBudgetMin(t.replace(/[^0-9]/g, ''))}
                      editable={!budgetUnsure}
                      placeholder="Min"
                      placeholderTextColor={colors.textTertiary}
                      maxLength={9}
                      accessibilityLabel="Minimum budget in pesos"
                    />
                  </View>
                  <Text style={styles.budgetDash}>to</Text>
                  <View style={[styles.budgetField, budgetUnsure && styles.budgetFieldOff]}>
                    <Text style={styles.budgetPrefix}>{platformConfig.currencySymbol}</Text>
                    <TextInput
                      style={styles.budgetInput}
                      keyboardType="numeric"
                      value={budgetMax}
                      onChangeText={(t) => setBudgetMax(t.replace(/[^0-9]/g, ''))}
                      editable={!budgetUnsure}
                      placeholder="Max"
                      placeholderTextColor={colors.textTertiary}
                      maxLength={9}
                      accessibilityLabel="Maximum budget in pesos"
                    />
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={toggleBudgetUnsure}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: budgetUnsure }}
                  accessibilityLabel="Not sure, let the pro quote"
                >
                  <View style={[styles.checkbox, budgetUnsure && styles.checkboxChecked]}>
                    {budgetUnsure ? <Check size={14} color={colors.white} /> : null}
                  </View>
                  <Text style={styles.checkboxLabel}>Not sure, let the pro quote</Text>
                </TouchableOpacity>
                {priceGuide ? <Text style={styles.priceGuide}>{priceGuide}</Text> : null}
                {budgetError ? <InlineError message={budgetError} /> : null}
              </SectionCard>

              <SectionCard icon={<Clock size={20} color={colors.primary} />} title="When">
                {URGENCY_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.urgencyOption, urgency === opt.value && styles.urgencySelected]}
                    onPress={() => setUrgency(opt.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: urgency === opt.value }}
                    accessibilityLabel={`${opt.label}. ${opt.desc}`}
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
              </SectionCard>

              <SectionCard
                icon={<MapPin size={20} color={colors.primary} />}
                title="Where"
                hint="Pros see your barangay and city. Your exact address goes only to the pro whose price you accept."
              >
                {/* BUG-PHASE71-01 fix — the card is tappable and routes to the
                    address picker, because choosing a service resets the
                    booking-store address and customers were otherwise stuck. */}
                <TouchableOpacity
                  style={[styles.addressCard, attempted && !addressReady && styles.inputError]}
                  onPress={() => router.push(Routes.CUSTOMER.ADDRESS_PICKER)}
                  activeOpacity={0.7}
                  testID="job-request-address-picker"
                  accessibilityRole="button"
                  accessibilityLabel={draft.address ? 'Change job address' : 'Choose job address'}
                >
                  <Text style={styles.addressText}>
                    {draft.address
                      ? [draft.address, draft.barangay, draft.city, draft.province].filter(Boolean).join(', ')
                      : 'No address selected. Tap to choose.'}
                  </Text>
                  <ChevronRight size={18} color={colors.textTertiary} />
                </TouchableOpacity>
                {draft.address && (draft.latitude == null || draft.longitude == null || !draft.barangay) ? (
                  <InlineError message="Select the exact map location and barangay before sending." />
                ) : attempted && !addressReady ? (
                  <InlineError message="Choose where the job is before sending." />
                ) : null}
              </SectionCard>

              <Text style={styles.footer}>
                Local pros who cover your area will see your request and send a price. You decide whether to accept. Nothing is charged when you send a request.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={styles.stickyBar}>
        <View style={[styles.stickyInner, !isPhone && styles.stickyInnerWide]}>
          {attempted && !canSend && questionsReady ? (
            <Text style={styles.stickyError}>Check the sections marked in red, then send again.</Text>
          ) : null}
          <TouchableOpacity
            style={[styles.submitBtn, (mutation.isPending || !questionsReady) && styles.submitBtnDisabled]}
            onPress={onSend}
            disabled={mutation.isPending || !questionsReady}
            accessibilityRole="button"
            accessibilityLabel="Send request"
            accessibilityState={{ disabled: mutation.isPending || !questionsReady, busy: mutation.isPending }}
          >
            {mutation.isPending ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.submitBtnText}>Send request</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  headerText: { flex: 1, alignItems: 'center' },
  headerTitle: { ...typography.h3, fontWeight: '700', color: colors.text },
  headerSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  placeholder: { width: 44 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: spacing.xl },
  formContent: { width: '100%' },
  formContentWide: { maxWidth: 1180, alignSelf: 'center' },
  requestWorkspace: { width: '100%' },
  requestWorkspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl },
  requestColumn: { width: '100%' },
  requestPrimaryWide: { flex: 1, minWidth: 0 },
  requestSecondaryWide: { width: 380 },
  card: { backgroundColor: colors.surface, borderRadius: borderRadius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.base, marginBottom: spacing.base },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  cardIcon: { width: 36, height: 36, borderRadius: borderRadius.lg, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  cardHeading: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text, lineHeight: 22 },
  cardHint: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginTop: 2 },
  inlineError: { fontSize: 13, color: colors.error, lineHeight: 18, marginTop: spacing.sm },
  input: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.text },
  textArea: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: 1, borderColor: colors.border, fontSize: 15, color: colors.text, minHeight: 132, lineHeight: 21 },
  inputError: { borderColor: colors.error },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoThumb: { width: 84, height: 84, borderRadius: borderRadius.lg, backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  photoImage: { width: '100%', height: '100%' },
  removeBtn: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(5,26,62,0.72)', alignItems: 'center', justifyContent: 'center' },
  addPhotoBtn: { borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  addPhotoText: { fontSize: 11, fontWeight: '600', color: colors.primary, marginTop: 4 },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  uploadingText: { fontSize: 13, color: colors.info },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  budgetField: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  budgetFieldOff: { backgroundColor: colors.backgroundSecondary, opacity: 0.6 },
  budgetPrefix: { fontSize: 15, color: colors.textSecondary, marginRight: spacing.xs },
  budgetInput: { flex: 1, paddingVertical: spacing.md, fontSize: 15, color: colors.text },
  budgetDash: { fontSize: 13, color: colors.textTertiary },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, minHeight: 44 },
  checkbox: { width: 22, height: 22, borderRadius: borderRadius.sm, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxLabel: { fontSize: 14, color: colors.text, fontWeight: '600', flex: 1 },
  priceGuide: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginTop: spacing.sm },
  urgencyOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm, gap: spacing.md },
  urgencySelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  radioSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  urgencyLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  urgencyLabelSelected: { color: colors.primary },
  urgencyDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  intakeField: { marginBottom: spacing.md },
  intakeLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 4 },
  intakeHelp: { fontSize: 12, color: colors.textSecondary, marginBottom: 6 },
  intakeNumberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  intakeUnit: { fontSize: 14, color: colors.textSecondary, minWidth: 36 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, minHeight: 40, justifyContent: 'center' },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText: { fontSize: 13, color: colors.text },
  chipTextSelected: { color: colors.primary, fontWeight: '600' },
  addressCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, minHeight: 48 },
  addressText: { fontSize: 14, color: colors.text, flex: 1, lineHeight: 20 },
  footer: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginTop: spacing.xs, marginBottom: spacing.base },
  stickyBar: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.md },
  stickyInner: { width: '100%' },
  stickyInnerWide: { maxWidth: 1180, alignSelf: 'center' },
  stickyError: { fontSize: 13, color: colors.error, marginBottom: spacing.sm, textAlign: 'center' },
  submitBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.lg, minHeight: 52, alignItems: 'center', justifyContent: 'center', width: '100%' },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },
});
