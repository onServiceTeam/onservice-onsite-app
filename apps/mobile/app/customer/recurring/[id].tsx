import React, { useState, useCallback } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, RefreshControl, TextInput, type DimensionValue,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { formatPHP } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ChevronLeft } from '@/components/icons';
// A7 — shared UI kit for loading/error states + toast feedback.
import { SkeletonCard, ErrorState } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { useResponsive } from '@/hooks/useResponsive';

interface RecurringDetail {
  id: string;
  categoryName: string;
  subcategoryName: string | null;
  providerName: string | null;
  frequency: string;
  preferredDay: number;
  preferredTime: string;
  status: string;
  servicePrice: number;
  serviceFee: number;
  totalAmount: number;
  nextScheduledDate: string | null;
  address: string;
  barangay: string;
  city: string;
  province: string;
  totalCompleted: number;
  totalSkipped: number;
  cancelReason: string | null;
  createdAt: string;
}

interface RecurringInstance {
  id: string;
  scheduledDate: string;
  status: string;
  bookingId: string | null;
  failureReason?: string | null;
}

const FREQ_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  bi_weekly: 'Bi-weekly',
  monthly: 'Monthly',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function RecurringDetailScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { isPhone } = useResponsive();
  const [showInstances, setShowInstances] = useState(false);
  // BUG-PHASE58-01 fix — pre-fix the cancel handler hardcoded
  // 'Cancelled by customer' as the reason. The reason gets recorded
  // in the audit trail and is used by ops to spot churn signals;
  // a constant string defeats both. Same pattern as the admin
  // RecurringPage fix in Phase 41 (BUG-PHASE41-02). Now: the cancel
  // button opens an inline form to capture an optional reason.
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const { data: recurring, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['recurring', id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: RecurringDetail }>(`/api/v1/recurring/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });

  const {
    data: instances,
    isLoading: instancesLoading,
    isError: instancesError,
    refetch: refetchInstances,
  } = useQuery({
    queryKey: ['recurring-instances', id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: RecurringInstance[] }>(
        `/api/v1/recurring/${id}/instances`,
      );
      return res.data.data;
    },
    enabled: !!id && showInstances,
  });

  const pauseMutation = useMutation({
    mutationFn: () => api.post(`/api/v1/recurring/${id}/pause`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recurring', id] });
      void queryClient.invalidateQueries({ queryKey: ['recurring-bookings'] });
      showToast('Recurring booking paused.', 'success');
    },
    onError: (err: unknown) => showToast(getErrorMessage(err, 'Operation failed.'), 'error'),
  });

  const resumeMutation = useMutation({
    mutationFn: () => api.post(`/api/v1/recurring/${id}/resume`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recurring', id] });
      void queryClient.invalidateQueries({ queryKey: ['recurring-bookings'] });
      showToast('Recurring booking resumed.', 'success');
    },
    onError: (err: unknown) => showToast(getErrorMessage(err, 'Operation failed.'), 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => api.post(`/api/v1/recurring/${id}/cancel`, { reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recurring', id] });
      void queryClient.invalidateQueries({ queryKey: ['recurring-bookings'] });
      showToast('Recurring booking cancelled.', 'success');
    },
    onError: (err: unknown) => showToast(getErrorMessage(err, 'Operation failed.'), 'error'),
  });

  const skipMutation = useMutation({
    mutationFn: (skipDate: string) => api.post(`/api/v1/recurring/${id}/skip`, { skipDate }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recurring', id] });
      void queryClient.invalidateQueries({ queryKey: ['recurring-instances', id] });
      showToast('Next instance skipped.', 'success');
    },
    onError: (err: unknown) => showToast(getErrorMessage(err, 'Operation failed.'), 'error'),
  });

  const handlePause = useCallback(() => {
    Alert.alert('Pause Recurring?', 'No new bookings will be created until you resume.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Pause', style: 'destructive', onPress: () => pauseMutation.mutate() },
    ]);
  }, [pauseMutation]);

  const handleResume = useCallback(() => {
    resumeMutation.mutate();
  }, [resumeMutation]);

  const handleCancel = useCallback(() => {
    // BUG-PHASE58-01 — show the inline form instead of firing the
    // mutation with a hardcoded reason.
    setShowCancelForm(true);
  }, []);

  const handleCancelConfirm = useCallback(() => {
    const reason = cancelReason.trim();
    cancelMutation.mutate(reason.length > 0 ? reason : 'Cancelled by customer (no reason given)');
    setShowCancelForm(false);
    setCancelReason('');
  }, [cancelReason, cancelMutation]);

  const handleSkipNext = useCallback(() => {
    if (!recurring?.nextScheduledDate) return;
    Alert.alert('Skip Next Instance?', `Skip the booking on ${new Date(recurring.nextScheduledDate).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' })}?`, [
      { text: 'No', style: 'cancel' },
      { text: 'Skip', onPress: () => skipMutation.mutate(recurring.nextScheduledDate!) },
    ]);
  }, [recurring, skipMutation]);

  if (isLoading || !recurring) {
    if (isError) {
      return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <ErrorState
            message="We couldn't load this recurring booking. Please check your connection and try again."
            onRetry={() => void refetch()}
          />
        </View>
      );
    }
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={{ padding: spacing.base }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  const isActive = recurring.status === 'active';
  const isPaused = recurring.status === 'paused';

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Recurring Booking</Text>
      </View>

      <View
        style={[styles.workspace, !isPhone && styles.workspaceWide]}
        accessibilityLabel={isPhone ? 'Recurring booking details' : 'Tablet and desktop recurring booking management workspace'}
      >
        <View style={styles.summaryColumn}>
          <View style={styles.serviceCard}>
            <Text style={styles.serviceName}>
              {recurring.subcategoryName ?? recurring.categoryName}
            </Text>
            <Text style={styles.serviceFreq}>
              {/* BUG-PHASE58-02 fix — invalid legacy weekdays use a visible fallback. */}
              {FREQ_LABELS[recurring.frequency] ?? recurring.frequency} &middot;{' '}
              {DAY_NAMES[recurring.preferredDay] ?? '—'} at {recurring.preferredTime ?? '—'}
            </Text>
            <Text style={styles.servicePrice}>{formatPHP(recurring.totalAmount)}</Text>
            <Text style={styles.servicePriceLabel}>scheduled total per visit</Text>
          </View>

          <View style={styles.detailSection}>
            <DetailRow label="Status" value={recurring.status.charAt(0).toUpperCase() + recurring.status.slice(1)} />
            <DetailRow label="Location" value={[recurring.address, recurring.barangay, recurring.city].filter(Boolean).join(', ')} />
            {recurring.providerName && <DetailRow label="Provider" value={recurring.providerName} />}
            <DetailRow label="Service price" value={formatPHP(recurring.servicePrice)} />
            <DetailRow label="Service fee" value={formatPHP(recurring.serviceFee)} />
            <DetailRow label="Scheduled total" value={formatPHP(recurring.totalAmount)} />
            <DetailRow label="Completed" value={String(recurring.totalCompleted)} />
            <DetailRow label="Skipped" value={String(recurring.totalSkipped)} />
            {recurring.nextScheduledDate && (
              <DetailRow
                label="Next Date"
                value={new Date(recurring.nextScheduledDate).toLocaleDateString('en-PH', {
                  weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Manila',
                })}
              />
            )}
            <DetailRow
              label="Created"
              value={new Date(recurring.createdAt).toLocaleDateString('en-PH', {
                month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila',
              })}
            />
          </View>
        </View>

        <View style={styles.operationsColumn}>
          <Text style={styles.operationsTitle}>Manage schedule</Text>
          <Text style={styles.operationsCopy}>Skip one visit, pause future bookings, or cancel the series.</Text>
          {(isActive || isPaused) && (
            <View style={styles.actions}>
              {isActive && recurring.nextScheduledDate && (
                <TouchableOpacity style={styles.actionBtn} onPress={handleSkipNext}>
                  <Text style={styles.actionBtnText}>Skip Next</Text>
                </TouchableOpacity>
              )}
              {isActive && (
                <TouchableOpacity style={[styles.actionBtn, styles.actionBtnWarning]} onPress={handlePause}>
                  <Text style={[styles.actionBtnText, styles.actionBtnWarningText]}>Pause</Text>
                </TouchableOpacity>
              )}
              {isPaused && (
                <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSuccess]} onPress={handleResume}>
                  <Text style={[styles.actionBtnText, styles.actionBtnSuccessText]}>Resume</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={handleCancel}>
                <Text style={[styles.actionBtnText, styles.actionBtnDangerText]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* BUG-PHASE58-01 — capture-reason form for cancellation. */}
          {showCancelForm && (
            <View style={styles.cancelForm}>
              <Text style={styles.cancelFormTitle}>Cancel Recurring Booking</Text>
              <Text style={styles.cancelFormSubtitle}>
                This permanently stops future bookings. Tell us why (optional) so we can improve.
              </Text>
              <TextInput
                value={cancelReason}
                onChangeText={setCancelReason}
                placeholder="Reason for cancelling…"
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                maxLength={500}
                style={styles.cancelInput}
              />
              <View style={styles.cancelActions}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => { setShowCancelForm(false); setCancelReason(''); }}
                  disabled={cancelMutation.isPending}
                >
                  <Text style={styles.actionBtnText}>Keep It</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnDanger]}
                  onPress={handleCancelConfirm}
                  disabled={cancelMutation.isPending}
                >
                  <Text style={[styles.actionBtnText, styles.actionBtnDangerText]}>
                    {cancelMutation.isPending ? 'Cancelling…' : 'Confirm Cancel'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={styles.toggleInstances}
            onPress={() => setShowInstances(!showInstances)}
            accessibilityRole="button"
          >
            <Text style={styles.toggleText}>
              {showInstances ? 'Hide History' : 'View History'}
            </Text>
          </TouchableOpacity>

          {showInstances && (
            <View style={styles.instancesSection}>
              {instancesLoading && <Text style={styles.noInstances}>Loading booking history…</Text>}
              {instancesError && (
                <TouchableOpacity onPress={() => void refetchInstances()} accessibilityRole="button">
                  <Text style={styles.historyError}>History could not be loaded. Tap to retry.</Text>
                </TouchableOpacity>
              )}
              {!instancesLoading && !instancesError && instances?.length === 0 && (
                <>
                  <Text style={styles.noInstances}>No instances yet.</Text>
                  <Text style={styles.noInstancesHint}>
                    Scheduled bookings will appear here after the recurring series begins.
                  </Text>
                </>
              )}
              {!instancesLoading && !instancesError && instances?.map((inst) => (
                <TouchableOpacity
                  key={inst.id}
                  style={styles.instanceRow}
                  disabled={!inst.bookingId}
                  onPress={() => inst.bookingId && router.push(`/customer/booking/${inst.bookingId}`)}
                  accessibilityRole={inst.bookingId ? 'button' : undefined}
                  accessibilityLabel={inst.bookingId ? `Open booking from ${inst.scheduledDate}` : undefined}
                >
                  <View style={styles.instanceCopy}>
                    <Text style={styles.instanceDate}>
                      {new Date(inst.scheduledDate).toLocaleDateString('en-PH', {
                        weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Manila',
                      })}
                    </Text>
                    {inst.failureReason && <Text style={styles.instanceFailure}>{inst.failureReason}</Text>}
                  </View>
                  <View style={styles.instanceOutcome}>
                    <Text style={[
                      styles.instanceStatus,
                      inst.status === 'completed' && styles.instanceCompleted,
                      inst.status === 'skipped' && styles.instanceSkipped,
                      inst.status === 'cancelled' && styles.instanceCancelled,
                    ]}>
                      {inst.status.charAt(0).toUpperCase() + inst.status.slice(1)}
                    </Text>
                    {inst.bookingId && <Text style={styles.openBooking}>Open booking</Text>}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  workspace: { width: '100%', maxWidth: 1120, alignSelf: 'center', padding: spacing.base },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl, padding: spacing.xl },
  summaryColumn: { flex: 1.15, minWidth: 0 },
  operationsColumn: {
    flex: 0.85,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
  },
  operationsTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.xs },
  operationsCopy: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.base },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  backBtn: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text },

  serviceCard: {
    backgroundColor: colors.primaryLight,
    marginBottom: spacing.base,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  serviceName: { ...typography.h2, color: colors.primary, marginBottom: spacing.xs },
  serviceFreq: { ...typography.body, color: colors.primary, marginBottom: spacing.xs },
  servicePrice: { ...typography.price, color: colors.primary },
  servicePriceLabel: { ...typography.caption, color: colors.primary, marginTop: 2 },

  detailSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  detailLabel: { ...typography.bodySmall, color: colors.textSecondary },
  detailValue: { ...typography.bodySmall, color: colors.text, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: spacing.base },

  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  actionBtn: {
    flex: 1,
    minWidth: '40%' as DimensionValue,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  actionBtnText: { ...typography.bodySmall, fontWeight: '600', color: colors.primary },
  actionBtnWarning: { borderColor: colors.warningDark },
  actionBtnWarningText: { color: colors.warningDark },
  actionBtnSuccess: { borderColor: colors.successDark, backgroundColor: colors.successLight },
  actionBtnSuccessText: { color: colors.successDark },
  actionBtnDanger: { borderColor: colors.error },
  actionBtnDangerText: { color: colors.error },

  toggleInstances: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  toggleText: { ...typography.body, color: colors.primary, fontWeight: '600' },

  instancesSection: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  noInstances: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  // BUG-PHASE182-01 fix — helper text under the empty history state.
  noInstancesHint: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    lineHeight: 20,
  },
  instanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  instanceCopy: { flex: 1, minWidth: 0, marginRight: spacing.sm },
  instanceOutcome: { alignItems: 'flex-end' },
  instanceDate: { ...typography.bodySmall, color: colors.text },
  instanceFailure: { ...typography.caption, color: colors.error, marginTop: 2 },
  instanceStatus: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  instanceCompleted: { color: colors.successDark },
  instanceSkipped: { color: colors.warningDark },
  instanceCancelled: { color: colors.error },
  openBooking: { ...typography.caption, color: colors.primary, marginTop: 2 },
  historyError: { ...typography.bodySmall, color: colors.error, textAlign: 'center', paddingVertical: spacing.sm },

  bottomSpacer: { height: 40 },

  cancelForm: {
    backgroundColor: colors.surface,
    marginBottom: spacing.base,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.error,
  },
  cancelFormTitle: { ...typography.h3, color: colors.error, marginBottom: spacing.xs },
  cancelFormSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 20 },
  cancelInput: {
    ...typography.body,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    minHeight: 80,
    marginBottom: spacing.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelActions: { flexDirection: 'row', gap: spacing.sm },
});
