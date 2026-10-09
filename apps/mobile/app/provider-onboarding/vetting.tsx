import React, { useState } from 'react';
// Provider vetting questionnaire — onboarding step 3 of 6, placed between
// Service Area (step 2) and Verification Documents (step 4). Collects the
// details our ops team needs to vet a pro well: experience, the business,
// online presence, credentials + registrations, a resume link, and up to
// three references. yearsExperience maps to providers.years_experience; the
// rest are saved into providers.vetting_answers (JSONB) on submit.
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView,
  type TextInputProps,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useOnboardingStore, emptyVetting, type VettingData, type VettingReference,
} from '@/stores/onboarding.store';
import { Button } from '@/components/ui';
import { ProviderApplicationDraftActions } from '@/components/ProviderApplicationDraftActions';
import { ConfirmModal } from '@/components/ConfirmModal';
import { applicationFieldsFromStore } from '@/services/provider-application-draft.service';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Briefcase } from '@/components/icons';
import { Routes } from '@/config/navigation';
import { useResponsive } from '@/hooks/useResponsive';

const BUSINESS_TYPES = ['Solo worker', 'Small team', 'Registered company'];

// Module-level so the input does not remount on every keystroke (which would
// drop focus). Renders a labelled input with an optional hint.
function LabeledInput(
  { label, hint, error, ...props }: { label: string; hint?: string; error?: string } & TextInputProps,
): React.ReactElement {
  const id = React.useId();
  return (
    <View>
      <Text nativeID={`${id}-label`} style={styles.fieldLabel}>{label}</Text>
      {hint ? <Text nativeID={`${id}-hint`} style={styles.fieldHint}>{hint}</Text> : null}
      <TextInput style={styles.input} placeholderTextColor={colors.textTertiary}
        accessibilityLabel={label} aria-labelledby={`${id}-label`} aria-required={label.endsWith('*')}
        aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} {...props} />
      {error ? <Text nativeID={`${id}-error`} style={styles.error} accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
}

export default function VettingScreen(): React.ReactElement {
  const router = useRouter();
  const store = useOnboardingStore();
  const { isPhone } = useResponsive();
  const [years, setYears] = useState(store.yearsExperience != null ? String(store.yearsExperience) : '');
  const [v, setV] = useState<VettingData>({ ...emptyVetting, ...store.vetting });
  const [removingReference, setRemovingReference] = useState<number | null>(null);
  const [errors, setErrors] = useState<{ years?: string; skills?: string; references?: string }>({});

  const refs: VettingReference[] = v.references.length > 0
    ? v.references
    : [{ name: '', contact: '', relation: '' }];

  const set = (patch: Partial<VettingData>): void => setV((prev) => ({ ...prev, ...patch }));
  const setRef = (i: number, patch: Partial<VettingReference>): void =>
    set({ references: refs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  const addRef = (): void => {
    if (refs.length < 3) set({ references: [...refs, { name: '', contact: '', relation: '' }] });
  };

  const validateContinue = (): boolean => {
    const nextErrors: typeof errors = {};
    const trimmedYears = years.trim();
    if (!/^\d{1,2}$/.test(trimmedYears) || Number(trimmedYears) > 60) {
      nextErrors.years = 'Enter your years of experience as a whole number from 0 to 60.';
    }
    if (v.mainSkills.trim().length < 2) {
      nextErrors.skills = 'Tell us your main skills or specialties (at least 2 characters).';
    }
    const incompleteIndex = refs.findIndex(reference => reference.name.trim().length < 2 || reference.contact.trim().length < 5);
    if (incompleteIndex >= 0) {
      nextErrors.references = `Complete the name and contact for reference ${incompleteIndex + 1}${incompleteIndex > 0 ? ' or remove that reference' : ''}. You can save incomplete details as a draft.`;
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const canContinue =
    years.trim().length > 0
    && v.mainSkills.trim().length >= 2
    && (refs[0]?.name.trim().length ?? 0) >= 2
    && (refs[0]?.contact.trim().length ?? 0) >= 5;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.progress}>
          <View style={[styles.progressDot, styles.progressDone]} />
          <View style={[styles.progressDot, styles.progressDone]} />
          <View style={[styles.progressDot, styles.progressActive]} />
          <View style={styles.progressDot} />
          <View style={styles.progressDot} />
          <View style={styles.progressDot} />
        </View>
        <Text style={styles.step}>3 / 6</Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        accessibilityLabel={isPhone ? 'Provider vetting form' : 'Tablet and desktop provider vetting workspace'}
      >
        <View style={styles.iconWrap}>
          <Briefcase size={28} color={colors.primary} />
        </View>
        <Text style={styles.title}>Your business &amp; experience</Text>
        <Text style={styles.subtitle}>
          The more you share, the faster we can vet you and the more trust customers
          give you. Required fields are marked; everything else is optional but helps.
        </Text>

        {/* ── Experience ── */}
        <Text style={styles.sectionLabel}>Experience</Text>
        <LabeledInput
          label="Years of experience *"
          hint="How long have you done this kind of work? (0 to 60)"
          value={years}
          error={errors.years}
          onChangeText={(t) => setYears(t.replace(/[^0-9]/g, '').slice(0, 2))}
          placeholder="e.g. 5"
          keyboardType="number-pad"
          maxLength={2}
        />
        <LabeledInput
          label="Main skills / specialties *"
          hint="What are you best at? Separate items with commas."
          value={v.mainSkills}
          error={errors.skills}
          onChangeText={(t) => set({ mainSkills: t })}
          placeholder="e.g. aircon cleaning, freon recharge, split-type install"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          style={[styles.input, styles.inputMultiline]}
          maxLength={500}
        />

        <Text style={styles.fieldLabel}>Do you have your own tools and equipment?</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity style={[styles.toggleBtn, v.hasOwnTools && styles.toggleBtnActive]} onPress={() => set({ hasOwnTools: true })} activeOpacity={0.7}>
            <Text style={[styles.toggleText, v.hasOwnTools && styles.toggleTextActive]}>Yes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, !v.hasOwnTools && styles.toggleBtnActive]} onPress={() => set({ hasOwnTools: false })} activeOpacity={0.7}>
            <Text style={[styles.toggleText, !v.hasOwnTools && styles.toggleTextActive]}>No</Text>
          </TouchableOpacity>
        </View>

        {/* ── Business ── */}
        <Text style={styles.sectionLabel}>Your business</Text>
        <Text style={styles.fieldLabel}>Are you a solo worker, a team, or a registered company?</Text>
        <View style={styles.chipRow}>
          {BUSINESS_TYPES.map((bt) => (
            <TouchableOpacity
              key={bt}
              style={[styles.chip, v.businessType === bt && styles.chipActive]}
              onPress={() => set({ businessType: v.businessType === bt ? '' : bt })}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, v.businessType === bt && styles.chipTextActive]}>{bt}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.row2}>
          <View style={styles.col}>
            <LabeledInput label="Year started" value={v.yearStarted} onChangeText={(t) => set({ yearStarted: t.replace(/[^0-9]/g, '').slice(0, 4) })} placeholder="e.g. 2018" keyboardType="number-pad" maxLength={4} />
          </View>
          <View style={styles.col}>
            <LabeledInput label="Team size" value={v.teamSize} onChangeText={(t) => set({ teamSize: t })} placeholder="e.g. 3 people" maxLength={40} />
          </View>
        </View>
        <LabeledInput
          label="Full business / shop address"
          hint="Street, barangay, city. Helps us confirm you are real and local."
          value={v.fullAddress}
          onChangeText={(t) => set({ fullAddress: t })}
          placeholder="e.g. 12 Mango Ave, Brgy. Kamputhaw, Cebu City"
          multiline
          numberOfLines={2}
          textAlignVertical="top"
          style={[styles.input, styles.inputMultiline]}
          maxLength={300}
        />

        {/* ── Online presence ── */}
        <Text style={styles.sectionLabel}>Online presence</Text>
        <Text style={styles.fieldHint}>Anything that shows your work or proves you are established.</Text>
        <LabeledInput label="Website" value={v.website} onChangeText={(t) => set({ website: t })} placeholder="e.g. www.yourbusiness.ph" autoCapitalize="none" keyboardType="url" maxLength={200} />
        <LabeledInput label="Facebook page / profile" value={v.facebook} onChangeText={(t) => set({ facebook: t })} placeholder="e.g. facebook.com/yourbusiness" autoCapitalize="none" maxLength={200} />
        <LabeledInput label="Other links (Instagram, TikTok, portfolio)" value={v.socialOther} onChangeText={(t) => set({ socialOther: t })} placeholder="Paste any other links" autoCapitalize="none" maxLength={300} />

        {/* ── Credentials ── */}
        <Text style={styles.sectionLabel}>Credentials &amp; registrations</Text>
        <LabeledInput
          label="Certifications / licenses"
          hint="TESDA, PRC, manufacturer training, safety certificates, etc."
          value={v.credentials}
          onChangeText={(t) => set({ credentials: t })}
          placeholder="List anything you hold"
          multiline
          numberOfLines={2}
          textAlignVertical="top"
          style={[styles.input, styles.inputMultiline]}
          maxLength={1000}
        />
        <LabeledInput
          label="Business registrations"
          hint="DTI / SEC name, BIR TIN, business or mayor's permit numbers (if any)."
          value={v.registrations}
          onChangeText={(t) => set({ registrations: t })}
          placeholder="e.g. DTI: ..., BIR TIN: ..., Permit: ..."
          multiline
          numberOfLines={2}
          textAlignVertical="top"
          style={[styles.input, styles.inputMultiline]}
          maxLength={1000}
        />
        <LabeledInput
          label="Resume / CV / portfolio link"
          hint="A Google Drive, Dropbox, or website link works."
          value={v.resumeUrl}
          onChangeText={(t) => set({ resumeUrl: t })}
          placeholder="Paste a link to your resume or portfolio"
          autoCapitalize="none"
          keyboardType="url"
          maxLength={300}
        />

        {/* ── References ── */}
        <Text style={styles.sectionLabel}>References</Text>
        {errors.references ? <Text style={styles.error} accessibilityRole="alert">{errors.references}</Text> : null}
        <Text style={styles.fieldHint}>
          People who can vouch for your work — past clients or supervisors. At least one is required.
        </Text>
        {refs.map((r, i) => (
          <View key={i} style={styles.refCard}>
            <Text style={styles.refTitle}>{i === 0 ? 'Reference 1 *' : `Reference ${i + 1}`}</Text>
            <LabeledInput label="Name" value={r.name} onChangeText={(t) => setRef(i, { name: t })} placeholder="e.g. Maria Santos" autoCapitalize="words" maxLength={120} />
            <LabeledInput label="Contact number" value={r.contact} onChangeText={(t) => setRef(i, { contact: t })} placeholder="e.g. 0917 123 4567" keyboardType="phone-pad" maxLength={40} />
            <LabeledInput label="How they know you" value={r.relation} onChangeText={(t) => setRef(i, { relation: t })} placeholder="e.g. past client, former supervisor" maxLength={60} />
            {i > 0 ? <Button title={`Remove reference ${i + 1}`} variant="ghost" onPress={() => setRemovingReference(i)} /> : null}
          </View>
        ))}
        {refs.length < 3 ? (
          <TouchableOpacity onPress={addRef} style={styles.addRefBtn} activeOpacity={0.7}>
            <Text style={styles.addRefText}>+ Add another reference</Text>
          </TouchableOpacity>
        ) : null}
      <View style={styles.footer}>
        <View style={[styles.footerInner, !isPhone && styles.footerInnerWide]}>
          <ProviderApplicationDraftActions
            fields={{ ...applicationFieldsFromStore(store), yearsExperience: years === '' ? null : Number(years),
              vettingAnswers: { ...v, references: refs } }}
            validateContinue={validateContinue} continueDisabled={!canContinue}
            onContinue={() => router.push(Routes.PROVIDER_ONBOARDING.DOCUMENTS)} />
        </View>
      </View>
      </ScrollView>
      <ConfirmModal visible={removingReference !== null} title="Remove this reference?"
        message="This removes the reference from your form. Save the draft to update the saved version."
        confirmLabel="Remove reference" destructive onCancel={() => setRemovingReference(null)}
        onConfirm={() => {
          set({ references: refs.filter((_reference, index) => index !== removingReference) });
          setRemovingReference(null);
        }} />
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
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: spacing.base, paddingTop: spacing.base, paddingBottom: spacing.lg },
  bodyContentWide: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
    padding: spacing.xl,
    marginVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
  },
  iconWrap: {
    width: 56, height: 56, borderRadius: borderRadius.md, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  title: { ...typography.h2, color: colors.text, marginBottom: spacing.xs },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 20 },
  sectionLabel: {
    ...typography.body, fontWeight: '700', color: colors.primary,
    marginTop: spacing.lg, marginBottom: spacing.xs,
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md,
  },
  fieldLabel: { ...typography.body, fontWeight: '600', color: colors.text, marginTop: spacing.md, marginBottom: 2 },
  fieldHint: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.sm },
  error: { ...typography.bodySmall, color: colors.error, marginBottom: spacing.sm },
  input: {
    ...typography.body, color: colors.text, backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md, marginBottom: spacing.sm,
  },
  inputMultiline: { minHeight: 70 },
  toggleRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  toggleBtn: {
    flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.md, borderWidth: 1.5,
    borderColor: colors.border, backgroundColor: colors.backgroundSecondary, alignItems: 'center',
  },
  toggleBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  toggleText: { ...typography.body, color: colors.textSecondary, fontWeight: '600' },
  toggleTextActive: { color: colors.primary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chip: {
    paddingVertical: spacing.sm, paddingHorizontal: spacing.base, borderRadius: borderRadius.full,
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: colors.primary },
  row2: { flexDirection: 'row', gap: spacing.sm },
  col: { flex: 1 },
  refCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md, borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border, padding: spacing.base, marginBottom: spacing.sm,
  },
  refTitle: { ...typography.body, fontWeight: '700', color: colors.text },
  addRefBtn: { paddingVertical: spacing.md, alignItems: 'center' },
  addRefText: { ...typography.body, color: colors.primary, fontWeight: '700' },
  footer: {
    paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  footerInner: { paddingHorizontal: spacing.base },
  footerInnerWide: { width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: spacing.xl },
});
