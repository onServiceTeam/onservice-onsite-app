import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAccountDeletionStatus,
  requestAccountDeletion,
  cancelAccountDeletion,
  requestDataExport,
  getDataExportStatus,
  getDataExportDownloadUrl,
  type AccountDeletionEntry,
} from '@/services/data-management.service';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { getErrorMessage } from '@/utils/errors';
import { Package, AlertTriangle, CheckCircle2, XCircle, Hourglass, ChevronLeft, Clock } from '@/components/icons';
// A7 — toast feedback instead of modal alerts.
import { showToast } from '@/lib/toast';
// Phase 14 R5-complete — wire ConfirmModal into delete-account destructive flow.
import ConfirmModal from '@/components/ConfirmModal';
import { useResponsive } from '@/hooks/useResponsive';
import { getDataExportStatusText } from '@/utils/data-export-status';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila',
  });
}

function daysRemaining(isoEnd: string): number {
  const diff = new Date(isoEnd).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function AccountManagementScreen(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isPhone } = useResponsive();
  const [reason, setReason] = useState('');
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [downloadingExportId, setDownloadingExportId] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const deletionQuery = useQuery({
    queryKey: ['accountDeletion'],
    queryFn: getAccountDeletionStatus,
    staleTime: 30 * 1000,
  });
  const { isError: deletionError } = deletionQuery;

  const exportQuery = useQuery({
    queryKey: ['dataExports'],
    queryFn: getDataExportStatus,
    staleTime: 30 * 1000,
  });
  const { isError: exportError } = exportQuery;

  const deleteMutation = useMutation({
    mutationFn: () => requestAccountDeletion(reason.trim() || undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accountDeletion'] });
      setShowDeleteForm(false);
      setReason('');
      showToast('Account scheduled for deactivation and anonymization. You have 30 days to change your mind.', 'success');
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      showToast(getErrorMessage(err, 'Could not process request.'), 'error');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelAccountDeletion,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accountDeletion'] });
      showToast('Account deactivation cancelled. Your account is safe.', 'success');
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      showToast(getErrorMessage(err, 'Could not cancel.'), 'error');
    },
  });

  const exportMutation = useMutation({
    mutationFn: (format: 'json' | 'csv') => requestDataExport(format),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dataExports'] });
      showToast('Data export requested. It is being prepared — check back shortly.', 'success');
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      showToast(getErrorMessage(err, 'Could not export data.'), 'error');
    },
  });

  const isDeletionLoading = deletionQuery.isLoading;
  const activeDeletion: AccountDeletionEntry | null = deletionQuery.data ?? null;
  const hasPendingDeletion = activeDeletion && ['cooling_off', 'processing'].includes(activeDeletion.status);

  // Phase 14 R5-complete — ConfirmModal replaces Alert.alert for the
  // destructive delete-account flow.
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const handleConfirmDelete = (): void => setShowDeleteConfirm(true);

  const handleCancelDeletion = (): void => setShowCancelConfirm(true);

  const handleDownloadExport = async (exportId: string): Promise<void> => {
    setDownloadingExportId(exportId);
    try {
      const url = await getDataExportDownloadUrl(exportId);
      await Linking.openURL(url);
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not open the data export.'), 'error');
    } finally {
      setDownloadingExportId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Go back from account and data"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account & Data</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}
      >
        {(deletionError || exportError) && (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Text style={{ color: colors.error, fontSize: 13, textAlign: 'center' }}>Failed to load account data. Some information may be unavailable.</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Retry loading account data"
              onPress={() => { void deletionQuery.refetch(); void exportQuery.refetch(); }}
              style={styles.retryButton}
            >
              <Text style={styles.retryButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Data Rights</Text>
          <Text style={styles.sectionDesc}>
            Under the Philippine Data Privacy Act (RA 10173), you have the right to access, export, and request deletion of your personal data.
          </Text>
        </View>

        <View
          style={[styles.workspace, !isPhone && styles.workspaceWide]}
          accessibilityLabel={isPhone ? 'Account data workspace' : 'Tablet and desktop account data workspace'}
          testID="customer-account-workspace"
        >
        <View style={[styles.card, styles.workspaceCard]}>
          <View style={styles.cardIconWrap}><Package size={28} color={colors.primary} /></View>
          <Text style={styles.cardTitle}>Export My Data</Text>
          <Text style={styles.cardDesc}>
            Download a copy of all your personal information, bookings, reviews, messages, and wallet history.
          </Text>
          <View style={styles.exportBtns}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Request JSON data export"
              accessibilityState={{ disabled: exportMutation.isPending }}
              style={[styles.exportBtn, exportMutation.isPending && styles.btnDisabled]}
              onPress={() => exportMutation.mutate('json')}
              disabled={exportMutation.isPending}
            >
              <Text style={styles.exportBtnText}>Export as JSON</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Request CSV data export"
              accessibilityState={{ disabled: exportMutation.isPending }}
              style={[styles.exportBtn, exportMutation.isPending && styles.btnDisabled]}
              onPress={() => exportMutation.mutate('csv')}
              disabled={exportMutation.isPending}
            >
              <Text style={styles.exportBtnText}>Export as CSV</Text>
            </TouchableOpacity>
          </View>
          {exportMutation.isPending && (
            <ActivityIndicator size="small" color={colors.primary} style={styles.loader} />
          )}
          {(exportQuery.data?.length ?? 0) > 0 && (
            <View style={styles.exportHistory}>
              <Text style={styles.exportHistoryTitle}>Recent Exports</Text>
              {exportQuery.data!.slice(0, 3).map((exp) => {
                // BUG-PHASE96-01 fix — 'expired' fell through to the
                // Hourglass icon + grey colors.textSecondary which is
                // also the 'pending' / 'processing' visual. A user
                // who came back after the 30-day window saw what
                // looked like "still being prepared" with no
                // download link, which is wrong: status='expired'
                // means the signed URL has been deleted and the user
                // must request a new export. Branch out the expired
                // case explicitly — XCircle in textTertiary so it's
                // visually distinct from both "completed" (green
                // check) and "failed" (red X).
                const StatusIcon =
                  exp.status === 'completed' ? CheckCircle2
                  : exp.status === 'failed' ? XCircle
                  : exp.status === 'expired' ? XCircle
                  : Hourglass;
                const statusColor =
                  exp.status === 'completed' ? colors.success
                  : exp.status === 'failed' ? colors.error
                  : exp.status === 'expired' ? colors.textTertiary
                  : colors.textSecondary;
                // BUG-PHASE70-01 fix — pre-fix the row showed only the
                // status pill + date. The DataExportEntry returns a
                // short-lived authenticated download URL that the user is
                // supposed to use, but the UI never surfaced it.
                // So the user saw "completed" with no way to access
                // the file (a hard NPC RA 10173 §22 compliance gap —
                // the law guarantees the user a means to access their
                // exported data). Now: a Download link opens the
                // private download via Linking, plus an "Expires …" hint.
                const isDownloadable = exp.status === 'completed' && exp.downloadAvailable;
                return (
                  <View key={exp.id} style={styles.exportRow}>
                    <View style={styles.exportDetails}>
                      <StatusIcon size={14} color={statusColor} />
                      <Text style={styles.exportStatus}> {exp.format.toUpperCase()}</Text>
                      {isDownloadable && (
                        <TouchableOpacity
                          accessibilityRole="button"
                          onPress={() => { void handleDownloadExport(exp.id); }}
                          disabled={downloadingExportId === exp.id}
                          accessibilityLabel="Download exported data file"
                          accessibilityState={{ disabled: downloadingExportId === exp.id }}
                          style={styles.exportDownloadButton}
                          testID={`export-download-${exp.id}`}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.exportDownloadLink}>
                            {downloadingExportId === exp.id ? 'Opening…' : 'Download'}
                          </Text>
                        </TouchableOpacity>
                      )}
                      {exp.status === 'completed' && exp.expiresAt && (
                        <Text style={styles.exportExpires} numberOfLines={1}>
                          {`Expires ${formatDate(exp.expiresAt)}`}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.exportStateText}>{getDataExportStatusText(exp)}</Text>
                    <Text style={styles.exportDate}>{formatDate(exp.createdAt)}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={[styles.divider, !isPhone && styles.dividerWide]} />

        <View style={[styles.card, styles.workspaceCard]}>
          <View style={styles.cardIconWrap}><AlertTriangle size={28} color={colors.error} /></View>
          <Text style={[styles.cardTitle, { color: colors.error }]}>Deactivate &amp; Anonymize My Account</Text>

          {isDeletionLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: spacing.lg }} />
          ) : deletionError ? (
            <View style={styles.actionUnavailable} accessibilityRole="alert">
              <Text style={styles.actionUnavailableText}>
                We couldn't verify whether a deactivation request already exists. Retry before changing your account status.
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Retry account deactivation status"
                style={styles.retryButton}
                onPress={() => void deletionQuery.refetch()}
              >
                <Text style={styles.retryButtonText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : hasPendingDeletion ? (
            <View style={styles.deletionActive}>
              <View style={styles.warningBanner}>
                <Clock size={18} color={colors.warning} style={{ marginRight: spacing.sm }} />
                <View style={styles.warningContent}>
                  <Text style={styles.warningTitle}>
                    Deactivation Scheduled
                  </Text>
                  <Text style={styles.warningText}>
                    Account deactivation and anonymization is scheduled for {formatDate(activeDeletion!.coolingOffEndsAt)}.
                    {'\n'}{daysRemaining(activeDeletion!.coolingOffEndsAt)} days remaining in cooling-off period.
                  </Text>
                </View>
              </View>
              {activeDeletion!.reason && (
                <Text style={styles.reasonText}>Reason: {activeDeletion!.reason}</Text>
              )}
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Cancel account deactivation and keep account"
                accessibilityState={{ disabled: cancelMutation.isPending }}
                style={styles.cancelDeleteBtn}
                onPress={handleCancelDeletion}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.success} />
                ) : (
                  <Text style={styles.cancelDeleteBtnText}>Cancel Deactivation — Keep My Account</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.cardDesc}>
                Deactivate and anonymize your account after a 30-day cooling-off period. Some booking, payment, dispute, and compliance records may be retained where required.
              </Text>
              <View style={styles.deleteChecklist}>
                <Text style={styles.checklistItem}>• All active bookings must be completed or cancelled</Text>
                <Text style={styles.checklistItem}>• Wallet balance must be zero</Text>
                <Text style={styles.checklistItem}>• 30-day cooling-off period applies</Text>
                <Text style={styles.checklistItem}>• Your public profile will be deactivated and anonymized</Text>
                <Text style={styles.checklistItem}>• Records that must be retained are kept only for their required purpose</Text>
              </View>

              {showDeleteForm ? (
                <View style={styles.deleteForm}>
                  <Text style={styles.deleteFormLabel}>Reason for leaving (optional)</Text>
                  {/* BUG-PHASE165-01 fix — pre-fix this input had no
                      maxLength. Server caps at 1000 (Phase 156-01).
                      Same fix shape as Phase 145-150. */}
                  <TextInput
                    accessibilityLabel="Reason for account deactivation"
                    style={styles.reasonInput}
                    placeholder="Tell us why you're leaving..."
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    numberOfLines={3}
                    maxLength={1000}
                    value={reason}
                    onChangeText={setReason}
                    textAlignVertical="top"
                  />
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Continue to confirm account deactivation"
                    accessibilityState={{ disabled: deleteMutation.isPending }}
                    style={[styles.confirmDeleteBtn, deleteMutation.isPending && styles.btnDisabled]}
                    onPress={handleConfirmDelete}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Text style={styles.confirmDeleteBtnText}>Deactivate &amp; Anonymize My Account</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Cancel account deactivation form"
                    style={styles.cancelFormBtn}
                    onPress={() => { setShowDeleteForm(false); setReason(''); }}
                  >
                    <Text style={styles.cancelFormBtnText}>Never mind</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Request account deactivation"
                  style={styles.startDeleteBtn}
                  onPress={() => setShowDeleteForm(true)}
                >
                  <Text style={styles.startDeleteBtnText}>Request Account Deactivation</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
        </View>
      </ScrollView>
      {/* Phase 14 R5-complete — ConfirmModal for delete-account */}
      <ConfirmModal
        visible={showDeleteConfirm}
        title="Deactivate Account"
        message="This will schedule account deactivation and anonymization after a 30-day cooling-off period. Some records may be retained where required. You must have no active bookings and zero wallet balance."
        confirmLabel="Deactivate My Account"
        cancelLabel="Cancel"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          deleteMutation.mutate();
          setShowDeleteConfirm(false);
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
      <ConfirmModal
        visible={showCancelConfirm}
        title="Keep Account"
        message="Cancel the deactivation request and keep your account?"
        confirmLabel="Yes, Keep My Account"
        cancelLabel="No"
        loading={cancelMutation.isPending}
        onConfirm={() => {
          cancelMutation.mutate();
          setShowCancelConfirm(false);
        }}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 60 },
  bodyContentWide: { width: '100%', maxWidth: 1120, alignSelf: 'center' as const, paddingHorizontal: spacing.xl },
  errorBanner: { backgroundColor: colors.errorLight, padding: spacing.md, borderRadius: borderRadius.md, marginBottom: spacing.md, alignItems: 'center' as const },
  retryButton: { marginTop: spacing.sm, minHeight: 44, justifyContent: 'center' as const, paddingHorizontal: spacing.md },
  retryButtonText: { ...typography.bodySmall, color: colors.error, fontWeight: '700' as const },
  actionUnavailable: { backgroundColor: colors.errorLight, padding: spacing.md, borderRadius: borderRadius.md },
  actionUnavailableText: { ...typography.bodySmall, color: colors.error, lineHeight: 20, textAlign: 'center' as const },

  section: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  sectionDesc: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  workspace: { width: '100%' },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  workspaceCard: { flex: 1, minWidth: 0 },
  cardIcon: { fontSize: 28, marginBottom: spacing.sm },
  cardIconWrap: { marginBottom: spacing.sm, alignItems: 'flex-start' as const },
  cardTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  cardDesc: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.md },

  exportBtns: { flexDirection: 'row', gap: spacing.sm },
  exportBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  exportBtnText: { ...typography.bodySmall, fontWeight: '600', color: colors.white },
  btnDisabled: { opacity: 0.5 },
  loader: { marginTop: spacing.sm },

  exportHistory: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  exportHistoryTitle: { ...typography.caption, fontWeight: '600', color: colors.textTertiary, marginBottom: spacing.xs },
  exportRow: {
    alignItems: 'stretch', gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  exportDetails: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  exportStateText: { ...typography.bodySmall, color: colors.textSecondary },
  exportStatus: { ...typography.bodySmall, color: colors.text },
  exportDate: { ...typography.caption, color: colors.textTertiary },
  exportDownloadLink: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600' as const,
    marginLeft: spacing.sm,
    textDecorationLine: 'underline' as const,
  },
  exportDownloadButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center' as const,
  },
  exportExpires: {
    ...typography.caption,
    color: colors.textTertiary,
    marginLeft: spacing.sm,
    flex: 1,
  },

  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm },
  dividerWide: { display: 'none' },

  deletionActive: {},
  warningBanner: {
    flexDirection: 'row',
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  warningIcon: { fontSize: 24 },
  warningContent: { flex: 1 },
  warningTitle: { ...typography.body, fontWeight: '700', color: colors.warning, marginBottom: 2 },
  warningText: { ...typography.bodySmall, color: colors.text, lineHeight: 20 },
  reasonText: { ...typography.caption, color: colors.textTertiary, marginBottom: spacing.md, fontStyle: 'italic' },

  cancelDeleteBtn: {
    borderWidth: 2,
    borderColor: colors.success,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelDeleteBtnText: { ...typography.body, fontWeight: '700', color: colors.success },

  deleteChecklist: { marginBottom: spacing.md },
  checklistItem: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: 4, lineHeight: 20 },

  deleteForm: {},
  deleteFormLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  reasonInput: {
    ...typography.body,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    minHeight: 80,
    color: colors.text,
    marginBottom: spacing.md,
  },
  confirmDeleteBtn: {
    backgroundColor: colors.error,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  confirmDeleteBtnText: { ...typography.body, fontWeight: '700', color: colors.white },

  cancelFormBtn: { alignItems: 'center', paddingVertical: spacing.md },
  cancelFormBtnText: { ...typography.body, color: colors.textSecondary },

  startDeleteBtn: {
    borderWidth: 1.5,
    borderColor: colors.error,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  startDeleteBtnText: { ...typography.body, fontWeight: '600', color: colors.error },
});
