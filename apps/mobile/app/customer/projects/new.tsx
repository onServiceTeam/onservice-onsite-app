import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createProject } from '@/services/project.service';
import { getErrorMessage } from '@/utils/errors';
import { showToast } from '@/lib/toast';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ChevronLeft } from '@/components/icons';
import { platformConfig } from '@/config/platform.config';

export default function NewProjectScreen(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [estimate, setEstimate] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      createProject({
        title: title.trim(),
        description: description.trim() || undefined,
        city: city.trim() || undefined,
        estimatedTotal: estimate ? Math.round(Number(estimate) * 100) : undefined,
      }),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      showToast('Project created. Add your milestones next.', 'success');
      router.replace(`/customer/projects/${project.id}`);
    },
    onError: (err) => showToast(getErrorMessage(err, 'Could not create the project.'), 'error'),
  });

  const estimateValid = estimate === '' || Number.isFinite(Number(estimate));
  const isValid = title.trim().length > 0 && estimateValid;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>New Project</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Text style={styles.intro}>
          Projects are for big multi-stage jobs (a renovation, a build, an interior fit-out). Plan
          milestones, record your material choices, and keep documents like blueprints together.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Project title *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Kitchen renovation"
            placeholderTextColor={colors.textTertiary}
            maxLength={160}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="What's the project about? Scope, goals, anything a provider should know."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            maxLength={4000}
          />
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
            />
          </View>
          <Text style={styles.hint}>A planning figure only. Providers confirm real prices in their quotes.</Text>
        </View>

        <TouchableOpacity
          style={[styles.submit, !isValid && styles.submitDisabled]}
          onPress={() => mutation.mutate()}
          disabled={!isValid || mutation.isPending}
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
  intro: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 20 },
  field: { marginBottom: spacing.lg },
  label: { ...typography.body, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  input: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, fontSize: 14, color: colors.text },
  textArea: { minHeight: 100 },
  amountRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: spacing.base },
  prefix: { fontSize: 16, color: colors.textSecondary, marginRight: spacing.xs },
  amountInput: { flex: 1, paddingVertical: spacing.base, fontSize: 16, color: colors.text },
  hint: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  submit: { backgroundColor: colors.text, borderRadius: borderRadius.lg, paddingVertical: spacing.base, alignItems: 'center', marginTop: spacing.sm },
  submitDisabled: { opacity: 0.5 },
  submitText: { ...typography.body, fontWeight: '700', color: colors.white },
});
