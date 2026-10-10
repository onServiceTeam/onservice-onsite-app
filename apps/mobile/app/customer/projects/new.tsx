import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createProject, PROJECT_ADVISORY_BUDGET_MAX_PESOS } from '@/services/project.service';
import { getErrorMessage } from '@/utils/errors';
import { showToast } from '@/lib/toast';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ChevronLeft } from '@/components/icons';
import { platformConfig } from '@/config/platform.config';
import { useResponsive } from '@/hooks/useResponsive';
import { buildRoute, Routes } from '@/config/navigation';

export default function NewProjectScreen(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isPhone } = useResponsive();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [estimate, setEstimate] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      createProject({
        title: title.trim(),
        description: description.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        estimatedTotal: estimate ? Math.round(Number(estimate) * 100) : undefined,
      }),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      showToast('Project created. Add your milestones next.', 'success');
      router.replace(buildRoute(Routes.CUSTOMER.PROJECT_DETAIL, { id: project.id }));
    },
    onError: (err) => showToast(getErrorMessage(err, 'Could not create the project.'), 'error'),
  });

  const estimateValue = Number(estimate);
  const estimateValid = estimate === '' || (
    Number.isFinite(estimateValue)
    && estimateValue >= 0
    && estimateValue <= PROJECT_ADVISORY_BUDGET_MAX_PESOS
  );
  const isValid = title.trim().length > 0 && estimateValid;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back from new project"
        >
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>New Project</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}
        accessibilityLabel={!isPhone ? 'Wide project planning form' : undefined}
      >
        <Text style={styles.intro}>
          Projects are for big multi-stage jobs (a renovation, a build, an interior fit-out). Plan
          milestones, record your material choices, and keep documents like blueprints together.
        </Text>

        <View style={styles.planningNotice}>
          <Text style={styles.planningNoticeTitle}>Planning workspace only</Text>
          <Text style={styles.planningNoticeText}>
            Creating a project does not book or assign a provider, and no payment is collected here.
            Book a service or request quotes separately when you are ready to hire.
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Project title *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Kitchen renovation"
            placeholderTextColor={colors.textTertiary}
            maxLength={160}
            accessibilityLabel="Project title"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="What's the project about? Add the scope, goals, and planning notes you want to keep."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            maxLength={4000}
            accessibilityLabel="Project description"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Project address</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="Street, building, subdivision, or site reference"
            placeholderTextColor={colors.textTertiary}
            maxLength={500}
            accessibilityLabel="Project address"
          />
          <Text style={styles.hint}>Planning context only. A future booking still confirms its own service address.</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>City</Text>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            placeholder="Cebu City"
            placeholderTextColor={colors.textTertiary}
            maxLength={100}
            accessibilityLabel="Project city"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Estimated total budget (optional)</Text>
          <View style={styles.amountRow}>
            <Text style={styles.prefix}>{platformConfig.currencySymbol}</Text>
            <TextInput
              style={styles.amountInput}
              value={estimate}
              onChangeText={setEstimate}
              placeholder="0.00"
              placeholderTextColor={colors.textTertiary}
              keyboardType="numeric"
              accessibilityLabel="Estimated total budget"
            />
          </View>
          <Text style={styles.hint}>A planning figure only. A future booking or accepted quote determines the real price.</Text>
          {!estimateValid && <Text style={styles.validationText}>Enter an amount from 0 to {platformConfig.currencySymbol}20,000,000.</Text>}
        </View>

        <TouchableOpacity
          style={[styles.submit, !isValid && styles.submitDisabled]}
          onPress={() => mutation.mutate()}
          disabled={!isValid || mutation.isPending}
          accessibilityRole="button"
          accessibilityLabel="Create project"
          accessibilityState={{ disabled: !isValid || mutation.isPending, busy: mutation.isPending }}
        >
          {mutation.isPending ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitText}>Create Project</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.base, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { ...typography.h3, color: colors.text },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  bodyContentWide: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: spacing.xl },
  intro: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 20 },
  planningNotice: { backgroundColor: colors.infoLight, borderWidth: 1, borderColor: colors.info, borderRadius: borderRadius.lg, padding: spacing.base, marginBottom: spacing.lg },
  planningNoticeTitle: { ...typography.body, color: colors.infoDark, fontWeight: '700', marginBottom: spacing.xs },
  planningNoticeText: { ...typography.bodySmall, color: colors.infoDark, lineHeight: 20 },
  field: { marginBottom: spacing.lg },
  label: { ...typography.body, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  input: { minHeight: 48, backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, fontSize: 14, color: colors.text },
  textArea: { minHeight: 100 },
  amountRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: spacing.base },
  prefix: { fontSize: 16, color: colors.textSecondary, marginRight: spacing.xs },
  amountInput: { flex: 1, paddingVertical: spacing.base, fontSize: 16, color: colors.text },
  hint: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  validationText: { ...typography.caption, color: colors.error, marginTop: spacing.xs },
  submit: { minHeight: 48, backgroundColor: colors.primary, borderRadius: borderRadius.lg, paddingVertical: spacing.base, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  submitDisabled: { opacity: 0.5 },
  submitText: { ...typography.body, fontWeight: '700', color: colors.white },
});
