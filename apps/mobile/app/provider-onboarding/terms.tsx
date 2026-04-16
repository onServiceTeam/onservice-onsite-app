import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { useAuthStore } from '@/stores/auth.store';
import api, { storage } from '@/services/api';
import { Button } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

export default function TermsScreen(): React.ReactElement {
  const router = useRouter();
  const store = useOnboardingStore();
  const setUser = useAuthStore((s) => s.setUser);
  const [agreed, setAgreed] = useState(store.icAgreed);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ success: boolean; data: unknown }>('/api/v1/providers/apply', {
        businessName: store.businessName,
        categoryIds: store.categoryIds,
        serviceRadiusKm: store.serviceRadiusKm,
        latitude: store.latitude,
        longitude: store.longitude,
        city: store.city,
        province: store.province,
        governmentIdFrontUrl: store.governmentIdFrontUri,
        governmentIdBackUrl: store.governmentIdBackUri,
        nbiClearanceUrl: store.nbiClearanceUri,
        selfieUrl: store.selfieUri,
        icAgreementAccepted: true,
      });
      return res.data;
    },
    onSuccess: () => {
      const user = useAuthStore.getState().user;
      if (user) {
        setUser({ ...user, role: 'provider' });
      }
      storage.delete('isNewUser');
      store.reset();
      router.replace('/provider-onboarding/review-pending');
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      const msg = axErr?.response?.data?.error?.message ?? axErr?.message ?? 'Could not submit your application. Please try again.';
      Alert.alert('Submission Failed', msg);
    },
  });

  const handleSubmit = (): void => {
    if (!agreed) {
      Alert.alert('Agreement Required', 'You must accept the Independent Contractor agreement to proceed.');
      return;
    }
    store.setIcAgreed(true);
    submitMutation.mutate();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.progress}>
          <View style={[styles.progressDot, styles.progressDone]} />
          <View style={[styles.progressDot, styles.progressDone]} />
          <View style={[styles.progressDot, styles.progressDone]} />
          <View style={[styles.progressDot, styles.progressDone]} />
          <View style={[styles.progressDot, styles.progressActive]} />
        </View>
        <Text style={styles.step}>5 / 5</Text>
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Independent Contractor Agreement</Text>
        <Text style={styles.subtitle}>
          Please review and accept the agreement below before submitting your application.
        </Text>

        <View style={styles.agreementCard}>
          <Text style={styles.agreementTitle}>Key Terms</Text>

          <Text style={styles.clauseTitle}>1. Relationship</Text>
          <Text style={styles.clauseText}>
            You are registering as an independent contractor, not an employee of onService.
            You maintain full control over how, when, and where you perform services.
          </Text>

          <Text style={styles.clauseTitle}>2. Service Standards</Text>
          <Text style={styles.clauseText}>
            You agree to perform all jobs to a professional standard, arrive on time,
            and communicate promptly with customers.
          </Text>

          <Text style={styles.clauseTitle}>3. Commission</Text>
          <Text style={styles.clauseText}>
            onService charges a service fee (paid by the customer) per booking.
            Commission rates vary by your tier level and are detailed in the Provider Dashboard.
          </Text>

          <Text style={styles.clauseTitle}>4. Escrow Payments</Text>
          <Text style={styles.clauseText}>
            Customer payments are held in escrow until the job is confirmed complete.
            Funds are released to your wallet minus any applicable commission.
          </Text>

          <Text style={styles.clauseTitle}>5. Verification</Text>
          <Text style={styles.clauseText}>
            You consent to identity verification, NBI clearance validation, and ongoing
            background checks. You must keep your NBI clearance current.
          </Text>

          <Text style={styles.clauseTitle}>6. Disputes</Text>
          <Text style={styles.clauseText}>
            You agree to respond to customer disputes within 48 hours. Failure to respond
            may result in automatic resolution in the customer's favor.
          </Text>

          <Text style={styles.clauseTitle}>7. Termination</Text>
          <Text style={styles.clauseText}>
            Either party may end this agreement at any time. Outstanding job obligations
            and pending payouts will be honored.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => setAgreed((v) => !v)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkboxLabel}>
            I have read, understood, and agree to the Independent Contractor Agreement
            and the onService Terms of Service.
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        {submitMutation.isPending ? (
          <View style={styles.submitting}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.submittingText}>Submitting your application...</Text>
          </View>
        ) : (
          <Button
            title="Submit Application"
            onPress={handleSubmit}
            disabled={!agreed}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, marginRight: spacing.sm },
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
  title: { ...typography.h2, color: colors.text, marginBottom: spacing.xs },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  agreementCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  agreementTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },
  clauseTitle: { ...typography.body, fontWeight: '700', color: colors.text, marginTop: spacing.md, marginBottom: spacing.xs },
  clauseText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: colors.white, fontSize: 14, fontWeight: '700' },
  checkboxLabel: { ...typography.bodySmall, color: colors.text, flex: 1, lineHeight: 20 },
  footer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  submitting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  submittingText: { ...typography.body, color: colors.primary },
});
