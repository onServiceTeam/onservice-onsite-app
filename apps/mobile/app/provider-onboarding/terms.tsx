import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import { useOnboardingStore } from '@/stores/onboarding.store';
// Phase K CRIT-K10 fix — useAuthStore import dropped; we no longer
// mutate the auth store here. Role flip is canonical via backend.
import api, { storage } from '@/services/api';
import { getErrorMessage } from '@/utils/errors';
import { Button } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

import { Routes } from '@/config/navigation';
export default function TermsScreen(): React.ReactElement {
  const router = useRouter();
  const store = useOnboardingStore();
  // Phase K CRIT-K10 fix — setUser import removed; role flip now
  // only happens via canonical backend approval + token refresh.
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
        // Phase K MED-K07 — optional fields, dropped server-side when undefined.
        ...(store.nbiExpiryDate ? { nbiExpiryDate: store.nbiExpiryDate } : {}),
        ...(store.governmentIdNumber ? { governmentIdNumber: store.governmentIdNumber } : {}),
        // Vetting questionnaire (collected on the new vetting step). The apply
        // route now forwards these and the service persists them:
        // yearsExperience -> providers.years_experience, the rest ->
        // providers.vetting_answers JSONB (mig 136).
        ...(store.yearsExperience != null ? { yearsExperience: store.yearsExperience } : {}),
        ...(store.mainSkills.trim() ? { mainSkills: store.mainSkills.trim() } : {}),
        hasOwnTools: store.hasOwnTools,
        ...(store.referenceName.trim()
          ? {
              reference: {
                name: store.referenceName.trim(),
                contact: store.referenceContact.trim(),
              },
            }
          : {}),
      });
      return res.data;
    },
    onSuccess: () => {
      // Phase K CRIT-K10 fix — DO NOT flip role to 'provider' before
      // admin approval. Pre-fix: this set role='provider' locally
      // immediately on submit, which made any route guard reading
      // user.role pass the user as a fully-approved provider — they
      // could navigate to provider-tabs / provider features before
      // KYC was reviewed. Post-fix: role stays whatever the backend
      // assigned (typically 'customer' since onboarding starts from
      // a customer account); the application row sits at status
      // 'pending'. When admin approves, the backend updates
      // users.role; the next refreshAccessToken or sign-in picks up
      // the new role from the JWT claims. The REVIEW_PENDING screen
      // is the appropriate landing — it polls /provider/me for
      // status and the customer/provider tab routing follows the
      // canonical role from the auth store.
      storage.delete('isNewUser');
      store.reset();
      router.replace(Routes.PROVIDER_ONBOARDING.REVIEW_PENDING);
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      const msg = getErrorMessage(err, 'Could not submit your application. Please try again.');
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
          <View style={[styles.progressDot, styles.progressDone]} />
          <View style={[styles.progressDot, styles.progressActive]} />
        </View>
        <Text style={styles.step}>6 / 6</Text>
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Independent Contractor Agreement</Text>
        <Text style={styles.subtitle}>
          Please review and accept the agreement below before submitting your application.
        </Text>

        <View style={styles.agreementCard}>
          <Text style={styles.agreementTitle}>Key Terms</Text>

          <Text style={styles.clauseTitle}>1. Independent Contractor Relationship</Text>
          <Text style={styles.clauseText}>
            You register as an independent contractor — not an employee, agent, or partner
            of onService. You control how, when, and where you perform services and use your
            own tools and methods. Nothing in this agreement creates an employment,
            partnership, or joint-venture relationship.
          </Text>

          <Text style={styles.clauseTitle}>2. Service Standards</Text>
          <Text style={styles.clauseText}>
            You agree to perform every job competently, safely, and lawfully, to a
            professional standard, to arrive on time, and to communicate promptly with
            customers.
          </Text>

          <Text style={styles.clauseTitle}>3. Commission & Fees</Text>
          <Text style={styles.clauseText}>
            onService charges a service fee per booking. Your commission rate varies by tier
            and is shown in the Provider Dashboard. You agree these amounts may be deducted
            from your payouts.
          </Text>

          <Text style={styles.clauseTitle}>4. Escrow Payments</Text>
          <Text style={styles.clauseText}>
            Customer payments are held in escrow until the job is confirmed complete. Funds
            are released to your wallet minus any applicable commission. You agree not to
            accept or solicit off-platform or cash payment for jobs booked through onService.
          </Text>

          <Text style={styles.clauseTitle}>5. Verification</Text>
          <Text style={styles.clauseText}>
            You consent to identity verification, NBI clearance validation, and ongoing
            background checks, and you must keep your NBI clearance current. You confirm the
            documents and information you submit are genuine and yours.
          </Text>

          <Text style={styles.clauseTitle}>6. Taxes & Your Own Insurance</Text>
          <Text style={styles.clauseText}>
            As an independent contractor you are solely responsible for your own taxes and
            BIR obligations on your earnings. onService does not withhold or remit taxes on
            your behalf except where required by law. You are encouraged to carry your own
            liability insurance; onService does not insure you or your work.
          </Text>

          <Text style={styles.clauseTitle}>7. Liability & Indemnification</Text>
          <Text style={styles.clauseText}>
            You are solely responsible for any loss, injury, or property damage you (or your
            team members) cause while performing a service. You agree to indemnify and hold
            onService harmless from any claim, damage, or reasonable expense arising from
            your services, your breach of this agreement, or your violation of any law or
            third-party right.
          </Text>

          <Text style={styles.clauseTitle}>8. Compliance, Licenses & No Circumvention</Text>
          <Text style={styles.clauseText}>
            You will comply with all applicable laws and hold any licenses or permits your
            services require. You will not circumvent the platform, divert customers
            off-platform, misrepresent your identity or services, or post false reviews.
          </Text>

          <Text style={styles.clauseTitle}>9. Team Members</Text>
          <Text style={styles.clauseText}>
            If you add team members, you are responsible for their conduct, eligibility, and
            verification, and their performance counts toward your account. They must be
            approved through the platform's review before performing jobs.
          </Text>

          <Text style={styles.clauseTitle}>10. Data & Confidentiality</Text>
          <Text style={styles.clauseText}>
            You will use customer information only to perform the booked job and will handle
            it in accordance with the Data Privacy Act (RA 10173) and our Privacy Policy. You
            will not retain, share, or reuse customer data for any other purpose.
          </Text>

          <Text style={styles.clauseTitle}>11. Disputes</Text>
          <Text style={styles.clauseText}>
            You agree to respond to customer disputes within 48 hours. Failure to respond may
            result in automatic resolution in the customer's favor and a refund from escrow.
          </Text>

          <Text style={styles.clauseTitle}>12. Termination</Text>
          <Text style={styles.clauseText}>
            Either party may end this agreement at any time. Outstanding job obligations and
            pending payouts will be honored. Clauses on liability, indemnification, taxes,
            confidentiality, and no-circumvention survive termination. onService may suspend
            or remove you for safety, quality, fraud, or legal reasons.
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
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  title: { ...typography.h2, color: colors.text, marginBottom: spacing.xs },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  agreementCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
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
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
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
