import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOnboardingStore } from '@/stores/onboarding.store';
// Phase K CRIT-K10 fix — useAuthStore import dropped; we no longer
// mutate the auth store here. Role flip is canonical via backend.
import { storage } from '@/services/api';
import { applicationFieldsFromStore } from '@/services/provider-application-draft.service';
import { prepareApplicationSubmission } from '@/services/provider-application-submit.service';
import { captureApplicationLease, markApplicationSubmitted, saveAndSubmitApplicationSession, useApplicationSession } from '@/stores/provider-application-session.store';
import { ProviderApplicationDraftActions } from '@/components/ProviderApplicationDraftActions';
import { useApplicationOperation } from '@/hooks/useApplicationOperation';
import { getErrorMessage } from '@/utils/errors';
import { Button } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Check } from '@/components/icons';
import { useResponsive } from '@/hooks/useResponsive';

import { Routes } from '@/config/navigation';
export default function TermsScreen(): React.ReactElement {
  const router = useRouter();
  const store = useOnboardingStore();
  const { isPhone } = useResponsive();
  // Phase K CRIT-K10 fix — setUser import removed; role flip now
  // only happens via canonical backend approval + token refresh.
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useApplicationSession();
  const operation = useApplicationOperation(() => { setSubmitting(false); setAgreed(false); });

  const handleSubmit = async (): Promise<void> => {
    if (!agreed || submitting) return;
    const isCurrent = operation.begin();
    if (!isCurrent) return;
    setSubmitting(true);
    setError(null);
    try {
      const fields = prepareApplicationSubmission(applicationFieldsFromStore(store));
      const lease = captureApplicationLease();
      const confirmed = await saveAndSubmitApplicationSession(lease, fields, isCurrent);
      if (!confirmed || !isCurrent()) return;
      // Approval and role changes remain exclusively the backend's authority.
      storage.delete('isNewUser');
      markApplicationSubmitted(lease);
      router.replace(Routes.PROVIDER_ONBOARDING.REVIEW_PENDING);
    } catch (err) {
      if (isCurrent()) setError(getErrorMessage(err, 'We could not confirm submission. Check application status before trying again.'));
    } finally {
      if (isCurrent()) setSubmitting(false);
    }
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

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}
        showsVerticalScrollIndicator={false}
        accessibilityLabel={isPhone ? 'Provider agreement' : 'Desktop provider agreement workspace'}
      >
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
            For supported in-app payments, rely on the booking's paid and escrow status rather
            than a customer screenshot or claim. Release follows customer confirmation or the
            platform completion timer, minus applicable commission. You agree not to accept or
            solicit off-platform or cash payment for jobs booked through onService.
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
            You agree to respond promptly to customer disputes in the app. If you do not
            respond within the stated window, the case moves into onService support review.
            Refund and release outcomes are recorded by the authorized dispute process; silence
            alone is not represented by the app as an automatic participant-directed settlement.
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
          accessibilityRole="checkbox"
          accessibilityLabel="Accept the Independent Contractor Agreement and Terms of Service"
          accessibilityState={{ checked: agreed, disabled: submitting || session.busy }}
          disabled={submitting || session.busy}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed && <Check size={16} color={colors.white} />}
          </View>
          <Text style={styles.checkboxLabel}>
            I have read, understood, and agree to the Independent Contractor Agreement
            and the onService Terms of Service.
          </Text>
        </TouchableOpacity>
      <View style={styles.footer}>
        <View style={[styles.footerInner, !isPhone && styles.footerInnerWide]}>
          {error && <View style={{ gap: spacing.sm }}>
            <Text style={styles.error} accessibilityRole="alert">{error}</Text>
            <Text style={styles.submittingText}>Your details are still here. If submission may have reached the server, check its status before trying again.</Text>
            <Button title="Check application status" variant="outline"
              onPress={() => router.push(Routes.PROVIDER_ONBOARDING.REVIEW_PENDING)} />
          </View>}
          <ProviderApplicationDraftActions fields={applicationFieldsFromStore(store)} disabled={submitting} />
          {submitting ? (
            <View style={styles.submitting}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.submittingText}>Submitting your application...</Text>
            </View>
          ) : (
            <Button
              title="Submit Application"
              onPress={() => { void handleSubmit(); }}
              disabled={!agreed || session.busy || session.conflict || session.phase !== 'ready'}
            />
          )}
        </View>
      </View>
      </ScrollView>
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
  },
  bodyContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
  bodyContentWide: { width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: spacing.xl },
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
  footerInner: { width: '100%', gap: spacing.md },
  footerInnerWide: { maxWidth: 900, alignSelf: 'center' },
  submitting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  submittingText: { ...typography.body, color: colors.primary },
  error: { ...typography.bodySmall, color: colors.error },
});
