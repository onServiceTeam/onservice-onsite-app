import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBookingById } from '@/services/booking.service';
import { updateBookingStatus } from '@/services/provider-api.service';
import { getErrorMessage } from '@/utils/errors';
import { useLocation } from '@/hooks/useLocation';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { ChevronLeft, MapPin, Clock, MessageSquare } from '@/components/icons';

// On-site steps a team member can drive. Completion stays with the provider
// owner (it carries the checklist + after-photo quality gates).
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

  const { data: booking, isLoading, isError } = useQuery({
    queryKey: ['staffJob', id],
    queryFn: () => getBookingById(id),
    enabled: !!id,
    refetchInterval: 15000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ newStatus, location }: { newStatus: string; location?: { latitude: number; longitude: number } }) =>
      updateBookingStatus(id, newStatus, undefined, location),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staffJob', id] });
      void queryClient.invalidateQueries({ queryKey: ['staffJobs'] });
    },
    onError: (err: unknown) => Alert.alert('Could not update', getErrorMessage(err, 'Please try again.')),
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
        Alert.alert('Location needed', 'We need your current location to mark arrival.');
        return;
      }
    }
    statusMutation.mutate({ newStatus: action.status, location });
  }

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }
  if (isError || !booking) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]} edges={['top']}>
        <Text style={styles.errorText}>Could not load this job.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.linkBtn}><Text style={styles.linkText}>Go back</Text></TouchableOpacity>
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

        {booking.description ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Job notes</Text>
            <Text style={styles.notesText}>{booking.description}</Text>
          </View>
        ) : null}

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
          <Text style={styles.doneHint}>Service in progress. Your provider will confirm completion once the work is documented.</Text>
        ) : null}

        <TouchableOpacity style={styles.chatRow} onPress={() => router.push(`/provider/chat/${booking.id}`)}>
          <MessageSquare size={18} color={colors.secondary} style={{ marginRight: spacing.sm }} />
          <Text style={styles.chatText}>Chat with Customer</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  errorText: { ...typography.body, color: colors.textSecondary },
  linkBtn: { marginTop: spacing.md },
  linkText: { ...typography.body, color: colors.primary, fontWeight: '600' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 30 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 40 },
  statusPill: { alignSelf: 'flex-start', backgroundColor: colors.primaryLight, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 20, marginBottom: spacing.base },
  statusPillText: { ...typography.bodySmall, color: colors.primary, fontWeight: '700' },
  service: { ...typography.h2, color: colors.text },
  customer: { ...typography.body, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.base },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.sm },
  metaText: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  notesBox: { marginTop: spacing.base, backgroundColor: colors.backgroundSecondary, borderRadius: borderRadius.md, padding: spacing.base, borderWidth: 1, borderColor: colors.border },
  notesLabel: { ...typography.caption, color: colors.textTertiary, fontWeight: '600', marginBottom: spacing.xs },
  notesText: { ...typography.bodySmall, color: colors.text, lineHeight: 20 },
  actionBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: spacing.md + 2, alignItems: 'center', marginTop: spacing.lg },
  btnDisabled: { opacity: 0.6 },
  actionBtnText: { ...typography.body, fontWeight: '700', color: colors.white },
  doneHint: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg, lineHeight: 20 },
  chatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, backgroundColor: colors.backgroundSecondary, borderRadius: borderRadius.md, marginTop: spacing.lg },
  chatText: { ...typography.body, color: colors.secondary, fontWeight: '600' },
});
