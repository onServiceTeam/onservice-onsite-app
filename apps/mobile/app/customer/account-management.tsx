import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator,
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
  type AccountDeletionEntry,
} from '@/services/data-management.service';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Package, AlertTriangle, CheckCircle2, XCircle, Hourglass } from '@/components/icons';

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
  const [reason, setReason] = useState('');
  const [showDeleteForm, setShowDeleteForm] = useState(false);

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
      Alert.alert(
        'Deletion Requested',
        'Your account has been scheduled for deletion. You have 30 days to change your mind. After that, all your data will be permanently removed.',
      );
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      Alert.alert('Error', axErr?.response?.data?.error?.message ?? axErr?.message ?? 'Could not process request.');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelAccountDeletion,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accountDeletion'] });
      Alert.alert('Cancelled', 'Your account deletion has been cancelled. Your account is safe.');
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      Alert.alert('Error', axErr?.response?.data?.error?.message ?? 'Could not cancel.');
    },
  });

  const exportMutation = useMutation({
    mutationFn: (format: 'json' | 'csv') => requestDataExport(format),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dataExports'] });
      Alert.alert('Export Requested', 'Your data export is being prepared. Check back shortly.');
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      Alert.alert('Error', axErr?.response?.data?.error?.message ?? 'Could not export data.');
    },
  });

  const isDeletionLoading = deletionQuery.isLoading;
  const activeDeletion: AccountDeletionEntry | null = deletionQuery.data ?? null;
  const hasPendingDeletion = activeDeletion && ['cooling_off', 'processing'].includes(activeDeletion.status);

  const handleConfirmDelete = (): void => {
    Alert.alert(
      'Delete Account',
      'This will schedule your account for permanent deletion after a 30-day cooling-off period. You must have no active bookings and zero wallet balance. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(),
        },
      ],
    );
  };

  const handleCancelDeletion = (): void => {
    Alert.alert('Keep Account', 'Cancel the deletion request and keep your account?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, Keep My Account', onPress: () => cancelMutation.mutate() },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account & Data</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {(deletionError || exportError) && (
          <View style={{ backgroundColor: colors.errorLight, padding: 12, borderRadius: 10, marginBottom: 12 }}>
            <Text style={{ color: colors.error, fontSize: 13, textAlign: 'center' }}>Failed to load account data. Some information may be unavailable.</Text>
          </View>
        )}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Data Rights</Text>
          <Text style={styles.sectionDesc}>
            Under the Philippine Data Privacy Act (RA 10173), you have the right to access, export, and request deletion of your personal data.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardIconWrap}><Package size={28} color={colors.primary} /></View>
          <Text style={styles.cardTitle}>Export My Data</Text>
          <Text style={styles.cardDesc}>
            Download a copy of all your personal information, bookings, reviews, messages, and wallet history.
          </Text>
          <View style={styles.exportBtns}>
            <TouchableOpacity
              style={[styles.exportBtn, exportMutation.isPending && styles.btnDisabled]}
              onPress={() => exportMutation.mutate('json')}
              disabled={exportMutation.isPending}
            >
              <Text style={styles.exportBtnText}>Export as JSON</Text>
            </TouchableOpacity>
            <TouchableOpacity
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
                const StatusIcon = exp.status === 'completed' ? CheckCircle2 : exp.status === 'failed' ? XCircle : Hourglass;
                const statusColor = exp.status === 'completed' ? colors.success : exp.status === 'failed' ? colors.error : colors.textSecondary;
                return (
                  <View key={exp.id} style={styles.exportRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <StatusIcon size={14} color={statusColor} />
                      <Text style={styles.exportStatus}> {exp.format.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.exportDate}>{formatDate(exp.createdAt)}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.divider} />

        <View style={styles.card}>
          <View style={styles.cardIconWrap}><AlertTriangle size={28} color={colors.error} /></View>
          <Text style={[styles.cardTitle, { color: colors.error }]}>Delete My Account</Text>

          {isDeletionLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: spacing.lg }} />
          ) : hasPendingDeletion ? (
            <View style={styles.deletionActive}>
              <View style={styles.warningBanner}>
                <Text style={styles.warningIcon}>🕐</Text>
                <View style={styles.warningContent}>
                  <Text style={styles.warningTitle}>
                    Deletion Scheduled
                  </Text>
                  <Text style={styles.warningText}>
                    Your account will be permanently deleted on {formatDate(activeDeletion!.coolingOffEndsAt)}.
                    {'\n'}{daysRemaining(activeDeletion!.coolingOffEndsAt)} days remaining in cooling-off period.
                  </Text>
                </View>
              </View>
              {activeDeletion!.reason && (
                <Text style={styles.reasonText}>Reason: {activeDeletion!.reason}</Text>
              )}
              <TouchableOpacity
                style={styles.cancelDeleteBtn}
                onPress={handleCancelDeletion}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.success} />
                ) : (
                  <Text style={styles.cancelDeleteBtnText}>Cancel Deletion — Keep My Account</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.cardDesc}>
                Permanently delete your account and all associated data. This action cannot be undone after the 30-day cooling-off period.
              </Text>
              <View style={styles.deleteChecklist}>
                <Text style={styles.checklistItem}>• All active bookings must be completed or cancelled</Text>
                <Text style={styles.checklistItem}>• Wallet balance must be zero</Text>
                <Text style={styles.checklistItem}>• 30-day cooling-off period applies</Text>
                <Text style={styles.checklistItem}>• Your reviews will be anonymized</Text>
                <Text style={styles.checklistItem}>• Your messages will be redacted</Text>
              </View>

              {showDeleteForm ? (
                <View style={styles.deleteForm}>
                  <Text style={styles.deleteFormLabel}>Reason for leaving (optional)</Text>
                  <TextInput
                    style={styles.reasonInput}
                    placeholder="Tell us why you're leaving..."
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    numberOfLines={3}
                    value={reason}
                    onChangeText={setReason}
                    textAlignVertical="top"
                  />
                  <TouchableOpacity
                    style={[styles.confirmDeleteBtn, deleteMutation.isPending && styles.btnDisabled]}
                    onPress={handleConfirmDelete}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Text style={styles.confirmDeleteBtnText}>Permanently Delete My Account</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelFormBtn}
                    onPress={() => { setShowDeleteForm(false); setReason(''); }}
                  >
                    <Text style={styles.cancelFormBtnText}>Never mind</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.startDeleteBtn}
                  onPress={() => setShowDeleteForm(true)}
                >
                  <Text style={styles.startDeleteBtnText}>Request Account Deletion</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 60 },

  section: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  sectionDesc: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },

  card: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
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
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  exportStatus: { ...typography.bodySmall, color: colors.text },
  exportDate: { ...typography.caption, color: colors.textTertiary },

  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm },

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
