import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';
import { formatPHP } from '@/utils/currency';
import api from '@/services/api';

interface PayoutPrefs {
  frequency: string;
  minThreshold: number;
  preferredMethod: string;
  destinationAccount: string | null;
}

const FREQUENCIES = [
  { value: 'manual', label: 'Manual', desc: 'Withdraw when you want' },
  { value: 'daily', label: 'Daily', desc: 'Automatic payout every day' },
  { value: 'weekly', label: 'Weekly', desc: 'Automatic payout every Monday' },
  { value: 'biweekly', label: 'Bi-weekly', desc: 'Payout every 1st and 15th' },
  { value: 'monthly', label: 'Monthly', desc: 'Automatic payout on the 1st' },
];

const METHODS = [
  { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
];

export default function PayoutSettingsScreen(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [frequency, setFrequency] = useState('manual');
  const [method, setMethod] = useState('gcash');
  const [threshold, setThreshold] = useState('500');
  const [account, setAccount] = useState('');
  const [dirty, setDirty] = useState(false);

  const { data: prefs, isLoading, error } = useQuery({
    queryKey: ['payout-preferences'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: PayoutPrefs }>('/api/v1/wallet/payout-preferences');
      return res.data.data;
    },
  });

  useEffect(() => {
    if (prefs) {
      setFrequency(prefs.frequency);
      setMethod(prefs.preferredMethod);
      setThreshold(String(prefs.minThreshold / 100));
      setAccount(prefs.destinationAccount ?? '');
    }
  }, [prefs]);

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await api.put<{ success: boolean; data: PayoutPrefs }>('/api/v1/wallet/payout-preferences', body);
      return res.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payout-preferences'] });
      setDirty(false);
      Alert.alert('Saved', 'Your payout preferences have been updated.');
    },
    onError: (err: Error) => {
      Alert.alert('Error', err.message || 'Failed to save preferences.');
    },
  });

  const handleSave = useCallback(() => {
    const thresholdCentavos = Math.round(Number(threshold) * 100);
    if (isNaN(thresholdCentavos) || thresholdCentavos < platformConfig.minimumPayoutThreshold) {
      Alert.alert('Invalid Threshold', `Minimum payout threshold is ${formatPHP(platformConfig.minimumPayoutThreshold)}`);
      return;
    }
    if (frequency !== 'manual' && !account.trim()) {
      Alert.alert('Account Required', 'Please enter your payout account number.');
      return;
    }
    updateMutation.mutate({
      frequency,
      minThreshold: thresholdCentavos,
      preferredMethod: method,
      destinationAccount: account.trim() || null,
    });
  }, [frequency, method, threshold, account, updateMutation]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to load payout settings.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.retryBtn}>
          <Text style={styles.retryText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Payout Settings</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payout Frequency</Text>
        <Text style={styles.sectionDesc}>Choose how often you receive payouts</Text>

        {FREQUENCIES.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.optionCard, frequency === f.value && styles.optionCardActive]}
            onPress={() => { setFrequency(f.value); setDirty(true); }}
          >
            <View style={[styles.radio, frequency === f.value && styles.radioActive]}>
              {frequency === f.value && <View style={styles.radioInner} />}
            </View>
            <View style={styles.optionInfo}>
              <Text style={[styles.optionLabel, frequency === f.value && styles.optionLabelActive]}>
                {f.label}
              </Text>
              <Text style={styles.optionDesc}>{f.desc}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payout Method</Text>

        <View style={styles.methodRow}>
          {METHODS.map((m) => (
            <TouchableOpacity
              key={m.value}
              style={[styles.methodChip, method === m.value && styles.methodChipActive]}
              onPress={() => { setMethod(m.value); setDirty(true); }}
            >
              <Text style={[styles.methodText, method === m.value && styles.methodTextActive]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Number</Text>
        <TextInput
          style={styles.input}
          value={account}
          onChangeText={(v) => { setAccount(v); setDirty(true); }}
          placeholder={method === 'gcash' ? '09XX XXX XXXX' : method === 'maya' ? '09XX XXX XXXX' : 'Account number'}
          keyboardType="default"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Minimum Payout Threshold</Text>
        <Text style={styles.sectionDesc}>
          Auto-payouts trigger only when your balance exceeds this amount
        </Text>
        <View style={styles.thresholdRow}>
          <Text style={styles.currencySymbol}>{platformConfig.currencySymbol}</Text>
          <TextInput
            style={styles.thresholdInput}
            value={threshold}
            onChangeText={(v) => { setThreshold(v.replace(/[^0-9.]/g, '')); setDirty(true); }}
            keyboardType="decimal-pad"
            placeholder="500"
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, (!dirty || updateMutation.isPending) && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={!dirty || updateMutation.isPending}
      >
        {updateMutation.isPending ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <Text style={styles.saveBtnText}>Save Preferences</Text>
        )}
      </TouchableOpacity>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundSecondary },
  content: { paddingBottom: spacing.xxl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  errorText: { ...typography.body, color: colors.error, textAlign: 'center' },
  retryBtn: { marginTop: spacing.base },
  retryText: { ...typography.body, color: colors.primary, fontWeight: '600' },

  header: { paddingHorizontal: spacing.base, paddingTop: spacing.xxl, paddingBottom: spacing.base },
  backBtn: { padding: spacing.xs, marginBottom: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { ...typography.body, color: colors.primary },
  title: { ...typography.h2, color: colors.text },

  section: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.base,
    marginBottom: spacing.base,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  sectionDesc: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md },

  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  optionCardActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioActive: { borderColor: colors.primary },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  optionInfo: { flex: 1 },
  optionLabel: { ...typography.body, fontWeight: '600', color: colors.text },
  optionLabelActive: { color: colors.primary },
  optionDesc: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  methodRow: { flexDirection: 'row', gap: spacing.sm },
  methodChip: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  methodChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  methodText: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  methodTextActive: { color: colors.primary },

  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
  },

  thresholdRow: { flexDirection: 'row', alignItems: 'center' },
  currencySymbol: { ...typography.h3, color: colors.text, marginRight: spacing.sm },
  thresholdInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
  },

  saveBtn: {
    backgroundColor: colors.primary,
    marginHorizontal: spacing.base,
    paddingVertical: spacing.base,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { ...typography.button, color: colors.white },

  bottomSpacer: { height: 40 },
});
