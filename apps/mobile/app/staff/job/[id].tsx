import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBookingById } from '@/services/booking.service';
import { getBookingProofSummary } from '@/services/booking-proof.service';
import { updateBookingStatus } from '@/services/provider-api.service';
import ProofSummaryCard from '@/components/booking/ProofSummaryCard';
import { getErrorMessage } from '@/utils/errors';
import { useLocation } from '@/hooks/useLocation';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ChevronLeft, MapPin, Clock, MessageSquare } from '@/components/icons';
// A7 — shared UI kit for loading/error states + toast feedback.
import { SkeletonCard, ErrorState } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { Routes, buildRoute } from '@/config/navigation';
import { useResponsive } from '@/hooks/useResponsive';

// On-site steps a team member drives. D15 — completion is now staff-enabled:
// at in_progress the team member enters the SAME checklist + after-photo flow
// the provider owner uses (handled below, not via this map), and the server
// enforces the identical quality gates and attributes the work to the provider.
const STAFF_NEXT_ACTION: Record<string, { status: string; label: string }> = {
  paid: { status: 'provider_en_route', label: 'Start Navigation' },
  provider_en_route: { status: 'provider_arrived', label: "I've Arrived" },
  provider_arrived: { status: 'in_progress', label: 'Start Service' },
};

const STATUS_LABELS: Record<string, string> = {
  paid: 'Ready to start',
  provider_en_route: 'On the way',
  provider_arrived: 'Arrived',
  in_progress: 'Service in progress',
  completed_by_provider: 'Waiting for customer confirmation',
  confirmed: 'Completed',
};

export default function StaffJobDetailScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { getCurrentLocation, isLoading: gettingLocation } = useLocation();
  const { isPhone } = useResponsive();

  const { data: booking, isLoading, isError, refetch } = useQuery({
    queryKey: ['staffJob', id],
    queryFn: () => getBookingById(id),
    enabled: !!id,
    refetchInterval: 15000,
  });

  const proofQuery = useQuery({
    queryKey: ['bookingProofSummary', id],
    queryFn: () => getBookingProofSummary(id),
    enabled: !!id,
  });

  const statusMutation = useMutation({
    mutationFn: ({ newStatus, location }: { newStatus: string; location?: { latitude: number; longitude: number } }) =>
      updateBookingStatus(id, newStatus, undefined, location),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staffJob', id] });
      void queryClient.invalidateQueries({ queryKey: ['bookingProofSummary', id] });
      void queryClient.invalidateQueries({ queryKey: ['staffJobs'] });
    },
    onError: (err: unknown) => showToast(getErrorMessage(err, 'Could not update the job. Please try again.'), 'error'),
  });

  async function handleAction(): Promise<void> {
    if (!booking) return;
    const action = STAFF_NEXT_ACTION[booking.status];
    if (!action) return;
    let location: { latitude: number; longitude: number } | undefined;
    if (action.status === 'provider_arrived') {
      try {
        const loc = await getCurrentLocation();
        if (loc) location = { latitude: loc.latitude, longitude: loc.longitude };
      } catch {
        // getCurrentLocation surfaces its own errors; the server also re-checks.
      }
      if (!location) {
        showToast('We need your current location to mark arrival.', 'warning');
        return;
      }
    }
    statusMutation.mutate({ newStatus: action.status, location });
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={[styles.stateContent, !isPhone && styles.stateContentWide]}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </SafeAreaView>
    );
  }
  if (isError || !booking) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ErrorState
          message="We couldn't load this job. Please check your connection and try again."
          onRetry={() => void refetch()}
        />
      </SafeAreaView>
    );
  }

  const action = STAFF_NEXT_ACTION[booking.status];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Job Details</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View
          style={[styles.workspace, !isPhone && styles.workspaceWide]}
          accessibilityLabel={isPhone ? 'Assigned job record' : 'Tablet and desktop assigned job record workspace'}
        >
        <View style={styles.primaryColumn}>
        <View style={styles.infoCard}>
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>{STATUS_LABELS[booking.status] ?? booking.status.replace(/_/g, ' ')}</Text>
          </View>

          <Text style={styles.service}>{booking.serviceName ?? 'Service'}</Text>
          {booking.customerName ? <Text style={styles.customer}>{booking.customerName}</Text> : null}

          <View style={styles.metaRow}>
            <Clock size={14} color={colors.textTertiary} />
            <Text style={styles.metaText}>
              {booking.scheduledAt ? new Date(booking.scheduledAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not scheduled'}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <MapPin size={14} color={colors.textTertiary} />
            <Text style={styles.metaText}>{[booking.address, booking.barangay, booking.city].filter(Boolean).join(', ') || '—'}</Text>
          </View>
        </View>

        {booking.description ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Job notes</Text>
            <Text style={styles.notesText}>{booking.description}</Text>
          </View>
        ) : null}

        {proofQuery.data ? (
          <View style={styles.proofWrap}>
            <ProofSummaryCard summary={proofQuery.data} audience="provider" />
          </View>
        ) : proofQuery.isError ? (
          <TouchableOpacity style={styles.proofError} onPress={() => void proofQuery.refetch()}>
            <Text style={styles.proofErrorText}>The shared work record could not load. Tap to retry.</Text>
          </TouchableOpacity>
        ) : null}

        </View>

        <View style={[styles.actionColumn, !isPhone && styles.actionColumnWide]}>
        <View style={styles.fieldCard}>
          <Text style={styles.fieldEyebrow}>NEXT FIELD STEP</Text>
          <Text style={styles.fieldTitle}>
            {action?.label ?? (booking.status === 'in_progress' ? 'Document and close the work' : 'No field action needed')}
          </Text>
          <Text style={styles.fieldText}>
            Status changes, checklist work, photos, and completion are recorded against this assigned booking and your team-member account.
          </Text>

        {action ? (
          <TouchableOpacity
            style={[styles.actionBtn, (statusMutation.isPending || gettingLocation) && styles.btnDisabled]}
            onPress={() => { void handleAction(); }}
            disabled={statusMutation.isPending || gettingLocation}
            activeOpacity={0.85}
          >
            {(statusMutation.isPending || gettingLocation) ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.actionBtnText}>{action.label}</Text>
            )}
          </TouchableOpacity>
        ) : booking.status === 'in_progress' ? (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push(buildRoute(Routes.STAFF.JOB_CHECKLIST, { id: booking.id }) as never)}
            activeOpacity={0.85}
          >
            <Text style={styles.actionBtnText}>Open Checklist</Text>
          </TouchableOpacity>
        ) : null}
        {booking.status === 'in_progress' ? (
          <Text style={styles.doneHint}>Finish the checklist and add the required photos before submitting completion. The work counts toward your provider&apos;s record.</Text>
        ) : null}
        </View>

        <TouchableOpacity
          style={styles.chatRow}
          onPress={() => router.push({
            pathname: Routes.SUPPORT.NEW,
            params: {
              bookingId: booking.id,
              type: 'booking_issue',
              subject: `Help with assigned job ${booking.id.slice(0, 8)}`,
            },
          })}
        >
          <MessageSquare size={18} color={colors.secondary} style={{ marginRight: spacing.sm }} />
          <Text style={styles.chatText}>Get Booking Support</Text>
        </TouchableOpacity>
        <Text style={styles.chatBoundary}>
          Customer chat stays with the provider owner while assigned-team conversation access is being defined.
        </Text>
        </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  centered: { alignItems: 'center', justifyContent: 'center' },
  errorText: { ...typography.body, color: colors.textSecondary },
  linkBtn: { marginTop: spacing.md },
  linkText: { ...typography.body, color: colors.primary, fontWeight: '600' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  infoCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.base, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  stateContent: { padding: spacing.base },
  stateContentWide: { width: '100%', maxWidth: 920, alignSelf: 'center', padding: spacing.xl },
  workspace: { width: '100%', gap: spacing.base },
  workspaceWide: { maxWidth: 1180, alignSelf: 'center', flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg, padding: spacing.md },
  primaryColumn: { flex: 1, minWidth: 0 },
  actionColumn: { width: '100%', gap: spacing.base },
  actionColumnWide: { width: 360, flexShrink: 0 },
  fieldCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  fieldEyebrow: { ...typography.caption, color: colors.primary, fontWeight: '800', letterSpacing: 0.8 },
  fieldTitle: { ...typography.h2, color: colors.text, marginTop: spacing.xs },
  fieldText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.xs },
  statusPill: { alignSelf: 'flex-start', backgroundColor: colors.primaryLight, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 20, marginBottom: spacing.base },
  statusPillText: { ...typography.bodySmall, color: colors.primary, fontWeight: '700' },
  service: { ...typography.h2, color: colors.text },
  customer: { ...typography.body, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.base },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.sm },
  metaText: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  notesBox: { marginTop: spacing.base, backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.base, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  notesLabel: { ...typography.caption, color: colors.textTertiary, fontWeight: '600', marginBottom: spacing.xs },
  notesText: { ...typography.bodySmall, color: colors.text, lineHeight: 20 },
  proofWrap: { marginTop: spacing.base },
  proofError: {
    marginTop: spacing.base,
    padding: spacing.md,
    backgroundColor: colors.errorLight,
    borderRadius: borderRadius.md,
  },
  proofErrorText: { ...typography.bodySmall, color: colors.error },
  actionBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: spacing.md + 2, alignItems: 'center', marginTop: spacing.lg },
  btnDisabled: { opacity: 0.6 },
  actionBtnText: { ...typography.body, fontWeight: '700', color: colors.white },
  doneHint: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg, lineHeight: 20 },
  chatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginTop: spacing.lg },
  chatText: { ...typography.body, color: colors.secondary, fontWeight: '600' },
  chatBoundary: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 },
});
