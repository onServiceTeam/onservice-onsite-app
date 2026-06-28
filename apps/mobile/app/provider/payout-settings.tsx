import React, { useState, useEffect, useCallback } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { platformConfig } from '@/config/platform.config';
import { formatPHP } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errors';
import api from '@/services/api';
// A7 — shared UI kit for loading state + toast feedback.
import { SkeletonCard } from '@/components/ui';
import { showToast } from '@/lib/toast';

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

// BUG-PHASE48-01 fix — pre-fix this list had a single
// 'bank_transfer' option that did not match any value the
// WithdrawScreen accepts (gcash|maya|bank_instapay|bank_pesonet
// per `apps/mobile/app/provider/withdraw.tsx`). If a provider
// chose Bank Transfer here, their auto-payout would have a
// preferredMethod that fails server-side bank-rail routing
// (PayMongo splits InstaPay vs PESONet by amount). Now: the two
// rails are presented separately, matching the withdraw flow.
const METHODS = [
  { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' },
  { value: 'bank_instapay', label: 'Bank Transfer (InstaPay)' },
  { value: 'bank_pesonet', label: 'Bank Transfer (PESONet)' },
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
      showToast('Your payout preferences have been updated.', 'success');
    },
    onError: (err: unknown) => {
      // Phase K MED-K04 fix — canonical error helper.
      showToast(getErrorMessage(err, 'Failed to save preferences.'), 'error');
    },
  });

  // BUG-PHASE92-01 fix — strip every non-digit so a "09XX XXX XXXX"
  // entry round-trips through the server's strict /^09\d{9}$/ regex
  // (payout.service.validateDestinationAccount). Same normalization
  // as withdraw.tsx — both screens write to the same row.
  const normalizeAccount = (raw: string): string => raw.replace(/\D+/g, '');

  const handleSave = useCallback(() => {
    const thresholdCentavos = Math.round(Number(threshold) * 100);
    if (isNaN(thresholdCentavos) || thresholdCentavos < platformConfig.minimumPayoutThreshold) {
      showToast(`Minimum payout threshold is ${formatPHP(platformConfig.minimumPayoutThreshold)}.`, 'warning');
      return;
    }
    const normalizedAccount = normalizeAccount(account);
    if (frequency !== 'manual' && normalizedAccount.length === 0) {
      showToast('Please enter your payout account number.', 'warning');
      return;
    }
    updateMutation.mutate({
      frequency,
      minThreshold: thresholdCentavos,
      preferredMethod: method,
      destinationAccount: normalizedAccount || null,
    });
  }, [frequency, method, threshold, account, updateMutation]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, padding: spacing.base }}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
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
              <Text
                style={[styles.methodText, method === m.value && styles.methodTextActive]}
                numberOfLines={1}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Number</Text>
        {/* BUG-PHASE199-01 fix — pre-fix the Account Number TextInput
            had no maxLength. Server-side payout_destination_account
            column is VARCHAR(255), and the route now caps at 255 via
            updatePayoutPreferencesSchema. Same maxLength-sweep family
            as Phase 145/194/195/197/198. */}
        <TextInput
          style={styles.input}
          value={account}
          onChangeText={(v) => { setAccount(v); setDirty(true); }}
          placeholder={method === 'gcash' ? '09XX XXX XXXX' : method === 'maya' ? '09XX XXX XXXX' : 'Account number'}
          keyboardType="default"
          maxLength={255}
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
  // App design refresh — soft canvas so the white setting cards lift off the page.
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { paddingBottom: spacing.xxl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg, backgroundColor: colors.surfaceMuted },
  errorText: { ...typography.body, color: colors.error, textAlign: 'center' },
  retryBtn: { marginTop: spacing.base },
  retryText: { ...typography.body, color: colors.primary, fontWeight: '600' },

  header: { paddingHorizontal: spacing.base, paddingTop: spacing.xxl, paddingBottom: spacing.base },
  backBtn: { padding: spacing.xs, marginBottom: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { ...typography.body, color: colors.primary },
  title: { ...typography.h2, color: colors.text },

  // App design refresh — white surface card with a hairline border on the canvas.
  section: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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

  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  methodChip: {
    minWidth: '47%',
    flexGrow: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
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
