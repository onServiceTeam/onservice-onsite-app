import React, { useState } from 'react';
// Provider vetting questionnaire — onboarding step 3 of 6, placed between
// Service Area (step 2) and Verification Documents (step 4). Collects the
// details our ops team needs to vet a pro well: experience, the business,
// online presence, credentials + registrations, a resume link, and up to
// three references. yearsExperience maps to providers.years_experience; the
// rest are saved into providers.vetting_answers (JSONB) on submit.
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, Alert, ScrollView,
  type TextInputProps,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useOnboardingStore, emptyVetting, type VettingData, type VettingReference,
} from '@/stores/onboarding.store';
import { Button } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Briefcase } from '@/components/icons';
import { Routes } from '@/config/navigation';

const BUSINESS_TYPES = ['Solo worker', 'Small team', 'Registered company'];

// Module-level so the input does not remount on every keystroke (which would
// drop focus). Renders a labelled input with an optional hint.
function LabeledInput(
  { label, hint, ...props }: { label: string; hint?: string } & TextInputProps,
): React.ReactElement {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      <TextInput style={styles.input} placeholderTextColor={colors.textTertiary} {...props} />
    </View>
  );
}

export default function VettingScreen(): React.ReactElement {
  const router = useRouter();
  const store = useOnboardingStore();
  const [years, setYears] = useState(store.yearsExperience != null ? String(store.yearsExperience) : '');
  const [v, setV] = useState<VettingData>({ ...emptyVetting, ...store.vetting });

  const refs: VettingReference[] = v.references.length > 0
    ? v.references
    : [{ name: '', contact: '', relation: '' }];

  const set = (patch: Partial<VettingData>): void => setV((prev) => ({ ...prev, ...patch }));
  const setRef = (i: number, patch: Partial<VettingReference>): void =>
    set({ references: refs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  const addRef = (): void => {
    if (refs.length < 3) set({ references: [...refs, { name: '', contact: '', relation: '' }] });
  };

  const handleNext = (): void => {
    const trimmedYears = years.trim();
    if (!/^\d{1,2}$/.test(trimmedYears)) {
      Alert.alert('Required', 'Enter your years of experience as a whole number (0 to 60).');
      return;
    }
    const yearsNum = parseInt(trimmedYears, 10);
    if (yearsNum < 0 || yearsNum > 60) {
      Alert.alert('Out of range', 'Years of experience must be between 0 and 60.');
      return;
    }
    if (v.mainSkills.trim().length < 2) {
      Alert.alert('Required', 'Tell us your main skills or specialties (at least 2 characters).');
      return;
    }
    const ref1 = refs[0];
    if (!ref1 || ref1.name.trim().length < 2 || ref1.contact.trim().length < 5) {
      Alert.alert('Required', 'Add at least one reference with a name and a contact number.');
      return;
    }
    const cleanedRefs = refs
      .map((r) => ({ name: r.name.trim(), contact: r.contact.trim(), relation: r.relation.trim() }))
      .filter((r) => r.name.length >= 2 && r.contact.length >= 5);

    store.setVetting({
      yearsExperience: yearsNum,
      vetting: {
        ...v,
        mainSkills: v.mainSkills.trim(),
        businessType: v.businessType.trim(),
        yearStarted: v.yearStarted.trim(),
        teamSize: v.teamSize.trim(),
        fullAddress: v.fullAddress.trim(),
        website: v.website.trim(),
        facebook: v.facebook.trim(),
        socialOther: v.socialOther.trim(),
        credentials: v.credentials.trim(),
        registrations: v.registrations.trim(),
        resumeUrl: v.resumeUrl.trim(),
        references: cleanedRefs,
      },
    });
    router.push(Routes.PROVIDER_ONBOARDING.DOCUMENTS);
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
        contentContainerStyle={{ paddingBottom: spacing.lg }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
          onChangeText={(t) => setYears(t.replace(/[^0-9]/g, '').slice(0, 2))}
          placeholder="e.g. 5"
          keyboardType="number-pad"
          maxLength={2}
        />
        <LabeledInput
          label="Main skills / specialties *"
          hint="What are you best at? Separate items with commas."
          value={v.mainSkills}
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
        <Text style={styles.fieldHint}>
          People who can vouch for your work — past clients or supervisors. At least one is required.
        </Text>
        {refs.map((r, i) => (
          <View key={i} style={styles.refCard}>
            <Text style={styles.refTitle}>{i === 0 ? 'Reference 1 *' : `Reference ${i + 1}`}</Text>
            <LabeledInput label="Name" value={r.name} onChangeText={(t) => setRef(i, { name: t })} placeholder="e.g. Maria Santos" autoCapitalize="words" maxLength={120} />
            <LabeledInput label="Contact number" value={r.contact} onChangeText={(t) => setRef(i, { contact: t })} placeholder="e.g. 0917 123 4567" keyboardType="phone-pad" maxLength={40} />
            <LabeledInput label="How they know you" value={r.relation} onChangeText={(t) => setRef(i, { relation: t })} placeholder="e.g. past client, former supervisor" maxLength={60} />
          </View>
        ))}
        {refs.length < 3 ? (
          <TouchableOpacity onPress={addRef} style={styles.addRefBtn} activeOpacity={0.7}>
            <Text style={styles.addRefText}>+ Add another reference</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button title="Next" onPress={handleNext} disabled={!canContinue} />
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
  body: { flex: 1, paddingHorizontal: spacing.base, paddingTop: spacing.base },
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
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
});
