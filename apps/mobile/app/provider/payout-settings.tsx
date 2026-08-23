import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { SkeletonCard, ErrorState } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { getErrorMessage } from '@/utils/errors';
import { useResponsive } from '@/hooks/useResponsive';
import { Routes } from '@/config/navigation';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

interface PayoutPrefs {
  frequency: string;
  minThreshold: number;
  preferredMethod: string;
  destinationAccount: string | null;
}

const METHODS = [
  { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' },
  { value: 'bank_instapay', label: 'Bank Transfer (InstaPay)' },
  { value: 'bank_pesonet', label: 'Bank Transfer (PESONet)' },
] as const;

type PayoutMethod = typeof METHODS[number]['value'];

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'daily',
  weekly: 'weekly',
  biweekly: 'bi-weekly',
  monthly: 'monthly',
};

function isPayoutMethod(value: string): value is PayoutMethod {
  return METHODS.some((method) => method.value === value);
}

export default function PayoutSettingsScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isDesktop } = useResponsive();

  const [frequency, setFrequency] = useState('manual');
  const [method, setMethod] = useState<PayoutMethod>('gcash');
  const [account, setAccount] = useState('');
  const [dirty, setDirty] = useState(false);

  const { data: prefs, isLoading, isError, refetch } = useQuery({
    queryKey: ['payout-preferences'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: PayoutPrefs }>(
        '/api/v1/wallet/payout-preferences',
      );
      return res.data.data;
    },
  });

  useEffect(() => {
    if (!prefs) return;
    setFrequency(prefs.frequency);
    if (isPayoutMethod(prefs.preferredMethod)) setMethod(prefs.preferredMethod);
    setAccount(prefs.destinationAccount ?? '');
  }, [prefs]);

  const updateMutation = useMutation({
    mutationFn: async (body: { preferredMethod: PayoutMethod; destinationAccount: string | null }) => {
      const res = await api.put<{ success: boolean; data: PayoutPrefs }>(
        '/api/v1/wallet/payout-preferences',
        body,
      );
      return res.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payout-preferences'] });
      setDirty(false);
      showToast('Your withdrawal details have been updated.', 'success');
    },
    onError: (err: unknown) => {
      showToast(getErrorMessage(err, 'Failed to save withdrawal details.'), 'error');
    },
  });

  // BUG-PHASE92-01 — payout destinations are sent as digits only, matching
  // the canonical validation used by manual withdrawal requests.
  const normalizeAccount = (raw: string): string => raw.replace(/\D+/g, '');

  const handleSave = useCallback((): void => {
    const normalizedAccount = normalizeAccount(account);
    if (frequency !== 'manual' && normalizedAccount.length === 0) {
      showToast('Enter a withdrawal account before saving these manual payout details.', 'warning');
      return;
    }
    if (normalizedAccount.length === 0) {
      showToast('Please enter your withdrawal account number.', 'warning');
      return;
    }
    const isMobileWallet = method === 'gcash' || method === 'maya';
    if (isMobileWallet && !/^09\d{9}$/.test(normalizedAccount)) {
      showToast(`${method === 'gcash' ? 'GCash' : 'Maya'} needs an 11-digit PH mobile number starting with 09.`, 'warning');
      return;
    }
    if (!isMobileWallet && !/^\d{8,16}$/.test(normalizedAccount)) {
      showToast('Bank account numbers must contain 8 to 16 digits.', 'warning');
      return;
    }

    updateMutation.mutate({
      preferredMethod: method,
      destinationAccount: normalizedAccount || null,
    });
  }, [account, frequency, method, updateMutation]);

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContent}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ErrorState
          message="We couldn't load your withdrawal preferences. Please check your connection and try again."
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  const legacyFrequency = frequency !== 'manual'
    ? (FREQUENCY_LABELS[frequency] ?? frequency)
    : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Go back">
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Withdrawal Preferences</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[styles.workspace, isDesktop && styles.desktopWorkspace]}
          accessibilityLabel={isDesktop ? 'Desktop withdrawal preferences workspace' : undefined}
        >
          <View style={styles.guidanceColumn}>
            <View style={styles.noticeCard}>
              <Text style={styles.noticeEyebrow}>LAUNCH PAYOUT MODE</Text>
              <Text style={styles.noticeTitle}>Manual withdrawals only</Text>
              <Text style={styles.noticeText}>
                Automatic payout schedules are not active. Request each withdrawal from Earnings,
                then track its review and completion in Payout History.
              </Text>
            </View>

            {legacyFrequency && (
              <View style={styles.legacyCard} accessibilityLabel="Inactive saved payout cadence">
                <Text style={styles.legacyTitle}>Saved preference is inactive</Text>
                <Text style={styles.legacyText}>
                  Your saved {legacyFrequency} preference is preserved, but it has not scheduled a
                  payout and will not run automatically.
                </Text>
              </View>
            )}

            <View style={styles.actionCard}>
              <Text style={styles.actionTitle}>Ready to move available funds?</Text>
              <Text style={styles.actionText}>
                Your wallet balance, minimum amount, destination check, and request confirmation
                are handled in the withdrawal flow.
              </Text>
              <TouchableOpacity
                style={styles.primaryAction}
                onPress={() => router.push(Routes.PROVIDER.WITHDRAW)}
                accessibilityRole="button"
              >
                <Text style={styles.primaryActionText}>Withdraw funds</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryAction}
                onPress={() => router.push(Routes.PROVIDER.PAYOUTS)}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryActionText}>View payout history</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.detailsCard}>
            <Text style={styles.sectionTitle}>Saved withdrawal details</Text>
            <Text style={styles.sectionDesc}>
              These details prefill manual withdrawal requests. You can review and change them
              before submitting any request.
            </Text>

            <Text style={styles.fieldLabel}>Payout method</Text>
            <View style={styles.methodGrid}>
              {METHODS.map((item) => (
                <TouchableOpacity
                  key={item.value}
                  style={[styles.methodChip, method === item.value && styles.methodChipActive]}
                  onPress={() => {
                    setMethod(item.value);
                    setDirty(true);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: method === item.value }}
                >
                  <Text style={[styles.methodText, method === item.value && styles.methodTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>
              {method.startsWith('bank_') ? 'Bank account number' : 'Phone number'}
            </Text>
            <TextInput
              style={styles.input}
              value={account}
              onChangeText={(value) => {
                setAccount(value);
                setDirty(true);
              }}
              placeholder={method.startsWith('bank_') ? '8 to 16 digit account number' : '09XX XXX XXXX'}
              placeholderTextColor={colors.textTertiary}
              keyboardType={method.startsWith('bank_') ? 'default' : 'phone-pad'}
              maxLength={255}
              accessibilityLabel="Withdrawal account number"
            />
            <Text style={styles.fieldHint}>
              Saving details does not create a withdrawal or move money.
            </Text>

            <TouchableOpacity
              style={[styles.saveButton, (!dirty || updateMutation.isPending) && styles.disabledButton]}
              onPress={handleSave}
              disabled={!dirty || updateMutation.isPending}
              accessibilityRole="button"
            >
              <Text style={styles.saveButtonText}>
                {updateMutation.isPending ? 'Saving…' : 'Save withdrawal details'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  loadingContent: { width: '100%', maxWidth: 920, alignSelf: 'center', padding: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    marginRight: spacing.sm,
    padding: spacing.sm,
  },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text, flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: 80 },
  workspace: { width: '100%', maxWidth: 980, alignSelf: 'center', gap: spacing.base },
  desktopWorkspace: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  guidanceColumn: { flex: 1, minWidth: 0, gap: spacing.base },
  noticeCard: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  noticeEyebrow: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  noticeTitle: { ...typography.h2, color: colors.white, marginTop: spacing.sm },
  noticeText: { ...typography.body, color: colors.white, lineHeight: 22, marginTop: spacing.sm },
  legacyCard: {
    backgroundColor: colors.warningLight,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  legacyTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  legacyText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.xs },
  actionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  actionTitle: { ...typography.h3, color: colors.text },
  actionText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.xs },
  primaryAction: {
    minHeight: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.base,
    paddingHorizontal: spacing.base,
  },
  primaryActionText: { ...typography.button, color: colors.white },
  secondaryAction: {
    minHeight: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  secondaryActionText: { ...typography.button, color: colors.primary },
  detailsCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  sectionTitle: { ...typography.h2, color: colors.text },
  sectionDesc: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.xs },
  fieldLabel: { ...typography.bodySmall, color: colors.text, fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.sm },
  methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  methodChip: {
    minHeight: 44,
    minWidth: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  methodChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  methodText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600', textAlign: 'center' },
  methodTextActive: { color: colors.primary },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
  },
  fieldHint: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  saveButton: {
    minHeight: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.base,
  },
  disabledButton: { opacity: 0.5 },
  saveButtonText: { ...typography.button, color: colors.white },
});
