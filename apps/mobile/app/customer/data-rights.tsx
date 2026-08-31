/**
// Phase 14 remediation — audited (D14r-9 markers pass)
 * Phase 13 Dispatch C — Customer Data Rights (DSR) screen.
 *
 * NPC-compliant customer-facing surface for the Data Privacy Act rights:
 *   - Download my data    (request_type='access')
 *   - Correct my info     (request_type='correction')
 *   - Delete my account   (request_type='erasure', requires typed "DELETE")
 *
 * Submission writes a data_subject_requests row server-side; the API computes
 * the 15-day SLA. The customer can review prior requests through the scoped
 * /api/v1/compliance/my-requests endpoint. Form inputs include accessibility
 * labels.
 */

// LAUNCH-LIMITATIONS #3 fix — wired to the new
// /api/v1/compliance/my-requests endpoint via listMyDsrs.
import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  listMyDsrs,
  listPendingMaterialConsents,
  recordConsent,
  submitDataSubjectRequest,
  type DsrRecord,
  type DsrRequestType,
  type PendingMaterialConsent,
} from '@/services/compliance.service';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Shield, FileText, AlertTriangle, CheckCircle2, ChevronLeft } from '@/components/icons';
import { getErrorMessage } from '@/utils/errors';
import { useResponsive } from '@/hooks/useResponsive';
import { ErrorState } from '@/components/ui';
// A7 — toast feedback instead of modal alerts.
import { showToast } from '@/lib/toast';

type FlowKey = 'access' | 'correction' | 'erasure';

interface FlowConfig {
  key: FlowKey;
  requestType: DsrRequestType;
  title: string;
  shortDescription: string;
  longDescription: string;
  ctaLabel: string;
  requireDeleteConfirmation: boolean;
}

const FLOWS: FlowConfig[] = [
  {
    key: 'access',
    requestType: 'access',
    title: 'Download My Data',
    shortDescription: 'Get a copy of the personal data we hold about you.',
    longDescription:
      'You have the right under the Data Privacy Act (RA 10173) to access and receive a copy of your personal data. We will compile your profile, bookings, reviews, messages, and wallet history and update this request within 15 days. The DPO may contact you through your registered details if information or a secure delivery method is needed.',
    ctaLabel: 'Request my data',
    requireDeleteConfirmation: false,
  },
  {
    key: 'correction',
    requestType: 'correction',
    title: 'Correct My Information',
    shortDescription: 'Fix inaccurate or incomplete personal data.',
    longDescription:
      'If any of the personal data we hold about you is inaccurate or out of date, you have the right to have it corrected. Tell us what needs to be updated below — we will respond within 15 days.',
    ctaLabel: 'Submit correction request',
    requireDeleteConfirmation: false,
  },
  {
    key: 'erasure',
    requestType: 'erasure',
    title: 'Deactivate & Anonymize My Account',
    shortDescription: 'Deactivate your account and anonymize personal identifiers after a cooling-off period.',
    longDescription:
      'You may request account deactivation and anonymization. A 30-day cooling-off period applies before processing. Some booking, payment, dispute, tax, and compliance records may be retained where required, while personal identifiers are removed where the current workflow supports it. We will respond within 15 days.',
    ctaLabel: 'Request deactivation',
    requireDeleteConfirmation: true,
  },
];

interface SubmissionResult {
  flow: FlowKey;
  request: DsrRecord;
}

export default function DataRightsScreen(): React.ReactElement {
  const router = useRouter();
  const { isPhone } = useResponsive();
  const [activeFlow, setActiveFlow] = useState<FlowKey | null>(null);
  const [message, setMessage] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [lastResult, setLastResult] = useState<SubmissionResult | null>(null);

  // LAUNCH-LIMITATIONS #3 fix — pull the customer's past DSRs.
  const myRequestsQuery = useQuery<DsrRecord[]>({
    queryKey: ['my-dsr-requests'],
    queryFn: () => listMyDsrs(50),
    staleTime: 60 * 1000,
  });

  // LAUNCH-LIMITATIONS #5 fix — pull the customer's pending material
  // consent re-acknowledgements (if any). When the DPO publishes a new
  // consent_version with material=true, this returns the affected
  // types so the user can re-grant inline. Empty list = nothing to do.
  const pendingConsentsQuery = useQuery<PendingMaterialConsent[]>({
    queryKey: ['my-pending-consents'],
    queryFn: () => listPendingMaterialConsents(),
    staleTime: 60 * 1000,
  });

  const reConsentMutation = useMutation({
    mutationFn: (input: PendingMaterialConsent) => recordConsent({
      consentType: input.consentType,
      version: input.latestVersion,
      granted: true,
    }),
    onSuccess: () => { void pendingConsentsQuery.refetch(); },
    onError: (err: unknown) => {
      showToast(getErrorMessage(err, 'Could not record consent. Please try again in a moment.'), 'error');
    },
  });

  const submitMutation = useMutation({
    mutationFn: (input: { flow: FlowConfig; userMessage: string }) =>
      submitDataSubjectRequest({
        requestType: input.flow.requestType,
        userMessage: input.userMessage.trim().length > 0 ? input.userMessage.trim() : undefined,
      }).then((request) => ({ flow: input.flow.key, request })),
    onSuccess: (result) => {
      setLastResult(result);
      setActiveFlow(null);
      setMessage('');
      setDeleteConfirmText('');
      // Refresh the history so the new submission appears immediately.
      void myRequestsQuery.refetch();
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      showToast(getErrorMessage(err, 'Could not submit your request. Please try again.'), 'error');
    },
  });

  const openFlow = (key: FlowKey): void => {
    setActiveFlow(key);
    setMessage('');
    setDeleteConfirmText('');
    setLastResult(null);
  };

  const handleSubmit = (flow: FlowConfig): void => {
    if (flow.requireDeleteConfirmation && deleteConfirmText.trim() !== 'DELETE') {
      showToast('Type DELETE (in capitals) in the confirmation box to request account deactivation.', 'warning');
      return;
    }
    submitMutation.mutate({ flow, userMessage: message });
  };

  const renderFlow = (flow: FlowConfig): React.ReactElement => {
    const isErasure = flow.requireDeleteConfirmation;
    const canSubmit = !isErasure || deleteConfirmText.trim() === 'DELETE';
    return (
      <View key={flow.key} style={styles.flowCard}>
        <Text style={styles.flowTitle}>{flow.title}</Text>
        <Text style={styles.flowDescription}>{flow.longDescription}</Text>

        <Text style={styles.fieldLabel}>Tell us more about your request (optional)</Text>
        <TextInput
          style={styles.textArea}
          value={message}
          onChangeText={setMessage}
          placeholder="Add any details that will help us respond accurately."
          placeholderTextColor={colors.textTertiary}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          accessibilityLabel="Optional message describing your request"
          accessibilityHint="Provide additional context to help our DPO process your request."
          maxLength={1000}
        />

        {isErasure && (
          <View style={styles.deleteConfirmBlock}>
            <View style={styles.warningBanner}>
              <AlertTriangle size={18} color={colors.error} />
              <Text style={styles.warningText}>
                Processing starts after a 30-day cooling-off period. Type DELETE (all capitals) below to confirm your request.
              </Text>
            </View>
            <Text style={styles.fieldLabel}>Type DELETE to confirm</Text>
            <TextInput
              style={styles.textInput}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="DELETE"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel="Type DELETE to confirm account deactivation"
              accessibilityHint="You must type the word DELETE in capital letters to enable the request button."
            />
          </View>
        )}

        <View style={styles.flowActions}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => { setActiveFlow(null); setMessage(''); setDeleteConfirmText(''); }}
            disabled={submitMutation.isPending}
            accessibilityLabel="Cancel"
            accessibilityRole="button"
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.submitBtn,
              isErasure ? styles.submitBtnDanger : null,
              (!canSubmit || submitMutation.isPending) && styles.btnDisabled,
            ]}
            onPress={() => handleSubmit(flow)}
            disabled={!canSubmit || submitMutation.isPending}
            accessibilityLabel={flow.ctaLabel}
            accessibilityRole="button"
          >
            {submitMutation.isPending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.submitBtnText}>{flow.ctaLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderConfirmation = (result: SubmissionResult): React.ReactElement => {
    const flow = FLOWS.find((f) => f.key === result.flow);
    const refNumber = result.request.id.slice(-8).toUpperCase();
    const dueDate = new Date(result.request.dueAt).toLocaleDateString('en-PH', {
      year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila',
    });
    return (
      <View style={styles.confirmCard}>
        <View style={styles.confirmIconWrap}>
          <CheckCircle2 size={40} color={colors.success} />
        </View>
        <Text style={styles.confirmTitle}>Request received</Text>
        <Text style={styles.confirmSubtitle}>{flow?.title ?? 'Data subject request'}</Text>
        <View style={styles.refBlock}>
          <Text style={styles.refLabel}>Reference number</Text>
          <Text style={styles.refValue}>{refNumber}</Text>
        </View>
        <Text style={styles.confirmBody}>
          Our Data Protection Officer will respond by {dueDate} (within 15 days as required by the
          Data Privacy Act). Track the request below; the DPO may also contact you through your
          registered details if more information or a secure delivery method is needed.
        </Text>
        <Text style={styles.confirmFootnote}>
          Keep this reference number for your records. You can submit another request at any time.
        </Text>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => setLastResult(null)}
          accessibilityLabel="Done"
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={[styles.headerInner, !isPhone && styles.headerInnerWide]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Data Rights</Text>
            <Text style={styles.headerSubtitle}>Requests and privacy acknowledgements</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}
        refreshControl={
          <RefreshControl
            refreshing={myRequestsQuery.isRefetching || pendingConsentsQuery.isRefetching}
            onRefresh={() => {
              void myRequestsQuery.refetch();
              void pendingConsentsQuery.refetch();
            }}
          />
        }
      >
        <View style={styles.intro}>
          <View style={styles.introIcon}>
            <Shield size={28} color={colors.primary} />
          </View>
          <Text style={styles.introTitle}>Your rights under the Data Privacy Act</Text>
          <Text style={styles.introBody}>
            Under the Philippine Data Privacy Act (RA 10173), you have the right to access, correct,
            and request the deletion of personal data we hold about you. Submit a request below and
            our Data Protection Officer will respond within 15 days.
          </Text>
        </View>

        {lastResult ? (
          <View style={!isPhone ? styles.focusedPanelWide : undefined}>
            {renderConfirmation(lastResult)}
          </View>
        ) : null}

        {!lastResult && activeFlow ? (
          <View style={!isPhone ? styles.focusedPanelWide : undefined}>
            {renderFlow(FLOWS.find((f) => f.key === activeFlow)!)}
          </View>
        ) : null}

        {/* LAUNCH-LIMITATIONS #5 fix — pending material re-consents.
            Surfaced above the action cards so the user sees them on
            entering the screen. Each row gets an inline "I agree"
            button that hits POST /api/v1/compliance/consent with the
            latest version. */}
        {!lastResult && !activeFlow && pendingConsentsQuery.isError ? (
          <View style={styles.consentQueryError}>
            <ErrorState
              compact
              title="Policy acknowledgement status unavailable"
              message="We cannot verify whether an updated privacy policy needs your acknowledgement. Retry to load the current record."
              onRetry={() => void pendingConsentsQuery.refetch()}
            />
          </View>
        ) : null}

        {!lastResult && !activeFlow
          && (pendingConsentsQuery.data?.length ?? 0) > 0 && (
          <View style={styles.consentBanner}>
            <View style={styles.consentBannerHeader}>
              <AlertTriangle size={20} color={colors.warning ?? colors.error} />
              <Text style={styles.consentBannerTitle}>
                Updated policies need your acknowledgement
              </Text>
            </View>
            {(pendingConsentsQuery.data ?? []).map((c) => (
              <View key={c.consentType} style={styles.consentRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.consentRowTitle}>
                    {c.consentType.replace(/_/g, ' ')} — v{c.latestVersion}
                  </Text>
                  <Text style={styles.consentRowSummary}>{c.changeSummary}</Text>
                  {c.userCurrentVersion ? (
                    <Text style={styles.consentRowMeta}>
                      You previously {c.userLastAction === 'granted' ? 'accepted' : 'reviewed'}{' '}
                      v{c.userCurrentVersion}.
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={styles.consentAcceptBtn}
                  onPress={() => reConsentMutation.mutate(c)}
                  disabled={reConsentMutation.isPending}
                  accessibilityLabel={`I agree to the new ${c.consentType.replace(/_/g, ' ')} version ${c.latestVersion}`}
                  accessibilityRole="button"
                >
                  <Text style={styles.consentAcceptBtnText}>I agree</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {!lastResult && !activeFlow && (
          <View
            style={!isPhone ? styles.desktopWorkspace : undefined}
            accessibilityLabel={!isPhone ? 'Tablet and desktop data rights workspace' : undefined}
          >
            <View style={!isPhone ? styles.actionPanel : undefined}>
              <Text style={styles.panelEyebrow}>MAKE A REQUEST</Text>
              <Text style={styles.panelTitle}>Choose what you need</Text>
              {FLOWS.map((flow) => (
                <TouchableOpacity
                  key={flow.key}
                  style={styles.optionCard}
                  onPress={() => openFlow(flow.key)}
                  accessibilityLabel={flow.title}
                  accessibilityHint={flow.shortDescription}
                  accessibilityRole="button"
                >
                  <View style={styles.optionIcon}>
                    {flow.key === 'erasure' ? (
                      <AlertTriangle size={22} color={colors.error} />
                    ) : (
                      <FileText size={22} color={colors.primary} />
                    )}
                  </View>
                  <View style={styles.optionBody}>
                    <Text style={[
                      styles.optionTitle,
                      flow.key === 'erasure' ? { color: colors.error } : null,
                    ]}>{flow.title}</Text>
                    <Text style={styles.optionDescription}>{flow.shortDescription}</Text>
                  </View>
                  <Text style={styles.optionChevron}>›</Text>
                </TouchableOpacity>
              ))}
              <Text style={styles.footerNote}>
                For questions about your data rights, contact our Data Protection Officer at
                dpo@onservice.ph.
              </Text>
            </View>

            {/* LAUNCH-LIMITATIONS #3 fix — past DSR history. */}
            <View style={[styles.historySection, !isPhone && styles.historyPanel]}>
              <Text style={styles.historyHeader}>My past requests</Text>
              {myRequestsQuery.isLoading ? (
                <ActivityIndicator size="small" color={colors.primary} style={styles.historyLoader} />
              ) : myRequestsQuery.isError ? (
                <Text style={styles.historyEmpty}>
                  Could not load your past requests. Pull down to refresh, or check back later.
                </Text>
              ) : (myRequestsQuery.data?.length ?? 0) === 0 ? (
                <Text style={styles.historyEmpty}>
                  You have not submitted any data subject requests yet. When you do, they will
                  appear here with their status and 15-day SLA date.
                </Text>
              ) : (
                <View>
                  {(myRequestsQuery.data ?? []).map((req) => {
                    const due = new Date(req.dueAt);
                    const dueLabel = due.toLocaleDateString();
                    return (
                      <View key={req.id} style={styles.historyRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.historyTitle}>
                            {req.requestType.charAt(0).toUpperCase() + req.requestType.slice(1)}
                          </Text>
                          <Text style={styles.historyMeta}>
                            Submitted {new Date(req.receivedAt).toLocaleDateString()} · due {dueLabel}
                          </Text>
                        </View>
                        <Text style={[
                          styles.historyStatus,
                          req.status === 'completed' ? { color: colors.success } :
                          req.status === 'rejected' ? { color: colors.error } :
                          { color: colors.primary },
                        ]}>
                          {req.status}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerInner: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
  },
  headerInnerWide: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: spacing.xl },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  headerTitle: { ...typography.h3, color: colors.text },
  headerSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 60 },
  bodyContentWide: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: spacing.xl, paddingBottom: 64 },

  intro: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  introIcon: { marginBottom: spacing.sm },
  introTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs, textAlign: 'center' },
  introBody: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, textAlign: 'center' },

  desktopWorkspace: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  actionPanel: { flex: 1, minWidth: 0 },
  focusedPanelWide: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  panelEyebrow: { ...typography.caption, color: colors.primary, fontWeight: '700', letterSpacing: 1, marginBottom: spacing.xs },
  panelTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.md },

  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  optionIcon: { marginRight: spacing.md },
  optionBody: { flex: 1 },
  optionTitle: { ...typography.body, color: colors.text, fontWeight: '600' as const, marginBottom: 2 },
  optionDescription: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  optionChevron: { fontSize: 28, color: colors.textTertiary, marginLeft: spacing.xs },

  flowCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  flowTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.sm },
  flowDescription: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.base },
  fieldLabel: { ...typography.caption, color: colors.text, fontWeight: '600' as const, marginBottom: spacing.xs },
  textArea: {
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md,
    padding: spacing.sm, minHeight: 96, color: colors.text, backgroundColor: colors.background,
    marginBottom: spacing.base,
  },
  textInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md,
    padding: spacing.sm, color: colors.text, backgroundColor: colors.background,
    marginBottom: spacing.base,
  },

  deleteConfirmBlock: { marginTop: spacing.sm },
  warningBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.errorLight, padding: spacing.sm, borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  warningText: { ...typography.caption, color: colors.error, flex: 1, lineHeight: 18 },

  flowActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  cancelBtn: {
    flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.md,
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center',
  },
  cancelBtnText: { ...typography.body, color: colors.text, fontWeight: '600' as const },
  submitBtn: {
    flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.md,
    backgroundColor: colors.primary, alignItems: 'center',
  },
  submitBtnDanger: { backgroundColor: colors.error },
  submitBtnText: { ...typography.body, color: colors.white, fontWeight: '600' as const },
  btnDisabled: { opacity: 0.5 },

  confirmCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  confirmIconWrap: { marginBottom: spacing.md },
  confirmTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.xs },
  confirmSubtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.base },
  refBlock: {
    backgroundColor: colors.surfaceMuted,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.base,
    borderRadius: borderRadius.md, marginBottom: spacing.base, alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  refLabel: { ...typography.caption, color: colors.textSecondary, marginBottom: 4 },
  refValue: { ...typography.h2, color: colors.primary, letterSpacing: 2, fontFamily: 'monospace' },
  confirmBody: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: spacing.sm },
  confirmFootnote: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', marginBottom: spacing.base },
  primaryBtn: {
    paddingVertical: spacing.md, paddingHorizontal: spacing.xl,
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
  },
  primaryBtnText: { ...typography.body, color: colors.white, fontWeight: '600' as const },

  footerNote: {
    ...typography.caption, color: colors.textTertiary,
    textAlign: 'center', marginTop: spacing.lg, lineHeight: 18,
  },

  // LAUNCH-LIMITATIONS #3 fix — DSR history section.
  historySection: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  historyPanel: {
    flex: 1,
    minWidth: 0,
    marginTop: 0,
    paddingTop: 0,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
  },
  historyHeader: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  historyLoader: { marginVertical: spacing.lg },
  historyEmpty: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    paddingVertical: spacing.md,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  historyTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600' as const,
  },
  historyMeta: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  historyStatus: {
    ...typography.bodySmall,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
  },

  // LAUNCH-LIMITATIONS #5 fix — pending material consent banner.
  consentBanner: {
    backgroundColor: colors.warningLight ?? colors.errorLight,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.warning ?? colors.error,
  },
  consentQueryError: {
    backgroundColor: colors.errorLight,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.base,
    overflow: 'hidden',
  },
  consentBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  consentBannerTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700' as const,
    flex: 1,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  consentRowTitle: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '600' as const,
    textTransform: 'capitalize' as const,
  },
  consentRowSummary: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  consentRowMeta: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
    fontStyle: 'italic' as const,
  },
  consentAcceptBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  consentAcceptBtnText: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '600' as const,
  },
});
