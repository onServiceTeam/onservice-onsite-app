/**
 * Phase 13 Dispatch C — Customer Data Rights (DSR) screen.
 *
 * NPC-compliant customer-facing surface for the Data Privacy Act rights:
 *   - Download my data    (request_type='access')
 *   - Correct my info     (request_type='correction')
 *   - Delete my account   (request_type='erasure', requires typed "DELETE")
 *
 * Submission writes a data_subject_requests row server-side; the API computes
 * the 15-day SLA. The UI shows the most recent submission's confirmation
 * locally (a customer-side "list my requests" endpoint is deferred — see
 * LAUNCH-LIMITATIONS.md). Form inputs include accessibility labels.
 */

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import {
  submitDataSubjectRequest,
  type DsrRecord,
  type DsrRequestType,
} from '@/services/compliance.service';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Shield, FileText, AlertTriangle, CheckCircle2 } from '@/components/icons';

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
      'You have the right under the Data Privacy Act (RA 10173) to access and receive a copy of your personal data. We will compile your profile, bookings, reviews, messages, and wallet history and send a download link to your registered email within 15 days.',
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
    title: 'Delete My Account',
    shortDescription: 'Permanently remove your account and personal data.',
    longDescription:
      'You may request that we delete your personal data. This is irreversible. Some records (e.g., completed bookings, financial receipts required by BIR for 10 years) may be retained as required by law, but personal identifiers will be removed. We will respond within 15 days.',
    ctaLabel: 'Request account deletion',
    requireDeleteConfirmation: true,
  },
];

interface SubmissionResult {
  flow: FlowKey;
  request: DsrRecord;
}

export default function DataRightsScreen(): React.ReactElement {
  const router = useRouter();
  const [activeFlow, setActiveFlow] = useState<FlowKey | null>(null);
  const [message, setMessage] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [lastResult, setLastResult] = useState<SubmissionResult | null>(null);

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
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      Alert.alert(
        'Request failed',
        axErr?.response?.data?.error?.message ?? axErr?.message ?? 'Could not submit your request. Please try again.',
      );
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
      Alert.alert(
        'Confirmation required',
        'Type DELETE (in capitals) in the confirmation box to request account deletion.',
      );
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
                This action is irreversible. Type DELETE (all capitals) below to confirm.
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
              accessibilityLabel="Type DELETE to confirm account deletion"
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
          Data Privacy Act). We will contact you at your registered email.
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
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Data Rights</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
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

        {lastResult ? renderConfirmation(lastResult) : null}

        {!lastResult && activeFlow ? renderFlow(FLOWS.find((f) => f.key === activeFlow)!) : null}

        {!lastResult && !activeFlow && (
          <View>
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
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 60 },

  intro: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  introIcon: { marginBottom: spacing.sm },
  introTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs, textAlign: 'center' },
  introBody: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, textAlign: 'center' },

  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionIcon: { marginRight: spacing.md },
  optionBody: { flex: 1 },
  optionTitle: { ...typography.body, color: colors.text, fontWeight: '600' as const, marginBottom: 2 },
  optionDescription: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  optionChevron: { fontSize: 28, color: colors.textTertiary, marginLeft: spacing.xs },

  flowCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: 1,
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
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  confirmIconWrap: { marginBottom: spacing.md },
  confirmTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.xs },
  confirmSubtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.base },
  refBlock: {
    backgroundColor: colors.background,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.base,
    borderRadius: borderRadius.md, marginBottom: spacing.base, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
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
});
