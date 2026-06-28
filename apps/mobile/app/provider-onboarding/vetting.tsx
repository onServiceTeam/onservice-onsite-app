import React, { useState } from 'react';
// Provider vetting questionnaire — onboarding step 3 of 6, placed
// between Service Area (step 2) and Verification Documents (step 4).
// Captures years of experience, main skills, tool ownership, and one
// professional reference. Answers are saved into the onboarding store
// and travel in the application snapshot submitted on the Terms step.
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, Alert, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { Button } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Briefcase } from '@/components/icons';

import { Routes } from '@/config/navigation';

export default function VettingScreen(): React.ReactElement {
  const router = useRouter();
  const store = useOnboardingStore();
  const [years, setYears] = useState(
    store.yearsExperience != null ? String(store.yearsExperience) : '',
  );
  const [skills, setSkills] = useState(store.mainSkills);
  const [hasOwnTools, setHasOwnTools] = useState(store.hasOwnTools);
  const [refName, setRefName] = useState(store.referenceName);
  const [refContact, setRefContact] = useState(store.referenceContact);

  const handleNext = (): void => {
    const trimmedYears = years.trim();
    if (trimmedYears.length === 0 || !/^\d{1,2}$/.test(trimmedYears)) {
      Alert.alert('Required', 'Enter your years of experience as a whole number (0 to 60).');
      return;
    }
    const yearsNum = parseInt(trimmedYears, 10);
    if (Number.isNaN(yearsNum) || yearsNum < 0 || yearsNum > 60) {
      Alert.alert('Out of range', 'Years of experience must be between 0 and 60.');
      return;
    }
    if (skills.trim().length < 2) {
      Alert.alert('Required', 'Tell us your main skills or specialties (at least 2 characters).');
      return;
    }
    if (refName.trim().length < 2) {
      Alert.alert('Required', 'Enter the name of one professional reference.');
      return;
    }
    if (refContact.trim().length < 5) {
      Alert.alert('Required', 'Enter a contact number for your reference.');
      return;
    }

    store.setVetting({
      yearsExperience: yearsNum,
      mainSkills: skills.trim(),
      hasOwnTools,
      referenceName: refName.trim(),
      referenceContact: refContact.trim(),
    });
    router.push(Routes.PROVIDER_ONBOARDING.DOCUMENTS);
  };

  const canContinue =
    years.trim().length > 0
    && skills.trim().length >= 2
    && refName.trim().length >= 2
    && refContact.trim().length >= 5;

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
        <Text style={styles.title}>Tell Us About Your Work</Text>
        <Text style={styles.subtitle}>
          A few quick questions help us vet your experience and match you with the
          right jobs. This is part of how we keep quality high for customers.
        </Text>

        <Text style={styles.fieldLabel}>Years of experience</Text>
        <Text style={styles.fieldHint}>How long have you done this kind of work? (0 to 60)</Text>
        <TextInput
          style={styles.input}
          value={years}
          onChangeText={(v) => setYears(v.replace(/[^0-9]/g, '').slice(0, 2))}
          placeholder="e.g. 5"
          placeholderTextColor={colors.textTertiary}
          keyboardType="number-pad"
          maxLength={2}
        />

        <Text style={styles.fieldLabel}>Main skills / specialties</Text>
        <Text style={styles.fieldHint}>What are you best at? Separate items with commas.</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={skills}
          onChangeText={setSkills}
          placeholder="e.g. aircon cleaning, freon recharge, split-type install"
          placeholderTextColor={colors.textTertiary}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          maxLength={300}
        />

        <Text style={styles.fieldLabel}>Do you have your own tools and equipment?</Text>
        <Text style={styles.fieldHint}>Most jobs expect you to bring your own tools.</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, hasOwnTools && styles.toggleBtnActive]}
            onPress={() => setHasOwnTools(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleText, hasOwnTools && styles.toggleTextActive]}>Yes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, !hasOwnTools && styles.toggleBtnActive]}
            onPress={() => setHasOwnTools(false)}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleText, !hasOwnTools && styles.toggleTextActive]}>No</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>Professional reference</Text>
        <Text style={styles.fieldHint}>
          One person who can vouch for your work, such as a past client or supervisor.
        </Text>
        <Text style={styles.fieldLabel}>Reference name</Text>
        <TextInput
          style={styles.input}
          value={refName}
          onChangeText={setRefName}
          placeholder="e.g. Maria Santos"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="words"
          maxLength={100}
        />
        <Text style={styles.fieldLabel}>Reference contact number</Text>
        <TextInput
          style={styles.input}
          value={refContact}
          onChangeText={setRefContact}
          placeholder="e.g. 0917 123 4567"
          placeholderTextColor={colors.textTertiary}
          keyboardType="phone-pad"
          maxLength={20}
        />
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
  body: {
    flex: 1,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.h2, color: colors.text, marginBottom: spacing.xs },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  sectionLabel: { ...typography.body, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: 2 },
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
    marginBottom: spacing.sm,
  },
  inputMultiline: { minHeight: 80 },
  toggleRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  toggleBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
  },
  toggleBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  toggleText: { ...typography.body, color: colors.textSecondary, fontWeight: '600' },
  toggleTextActive: { color: colors.primary },
  footer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
