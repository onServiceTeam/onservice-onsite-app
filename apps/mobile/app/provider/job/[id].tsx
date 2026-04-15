import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBookingById, type Booking } from '@/services/booking.service';
import { updateBookingStatus } from '@/services/provider-api.service';
import { Badge, Button } from '@/components/ui';
import { formatPHP } from '@/utils/currency';
import { formatDateTime, formatRelative } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

const STATUS_LABELS: Record<string, string> = {
  requested: 'New Request',
  quoted: 'Quote Sent',
  matched: 'Assigned to You',
  payment_pending: 'Awaiting Payment',
  paid: 'Payment Confirmed',
  provider_en_route: 'On Your Way',
  provider_arrived: 'You\'ve Arrived',
  in_progress: 'In Progress',
  completed_by_provider: 'Awaiting Confirmation',
  confirmed: 'Confirmed by Customer',
  payout_ready: 'Payout Ready',
  paid_out: 'Paid Out',
};

function getStatusColor(status: string): string {
  if (['matched', 'paid', 'payment_pending'].includes(status)) return colors.statusConfirmed;
  if (['provider_en_route', 'provider_arrived', 'in_progress'].includes(status)) return colors.statusInProgress;
  if (['completed_by_provider', 'confirmed', 'payout_ready', 'paid_out'].includes(status)) return colors.statusCompleted;
  if (status.startsWith('cancelled')) return colors.statusCancelled;
  if (status === 'disputed') return colors.statusDisputed;
  return colors.statusPending;
}

const NEXT_STATUS: Record<string, { status: string; label: string; confirm?: string }> = {
  paid: { status: 'provider_en_route', label: 'Start Navigation', confirm: 'Are you heading to the job location?' },
  provider_en_route: { status: 'provider_arrived', label: 'I\'ve Arrived', confirm: 'Confirm you\'ve arrived at the location?' },
  provider_arrived: { status: 'in_progress', label: 'Start Service', confirm: 'Begin the service now?' },
  in_progress: { status: 'completed_by_provider', label: 'Mark Complete', confirm: 'Mark this job as complete? The customer will be asked to confirm.' },
};

export default function ProviderJobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: booking, isLoading, isError } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => getBookingById(id),
    enabled: !!id,
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  });

  const statusMutation = useMutation({
    mutationFn: (newStatus: string) => updateBookingStatus(id, newStatus),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['booking', id] });
      void queryClient.invalidateQueries({ queryKey: ['providerJobs'] });
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      Alert.alert('Error', axErr?.response?.data?.error?.message ?? 'Failed to update status.');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => updateBookingStatus(id, 'cancelled_by_provider', 'Provider cancelled'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['booking', id] });
      void queryClient.invalidateQueries({ queryKey: ['providerJobs'] });
      Alert.alert('Cancelled', 'Job has been cancelled.');
      router.back();
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      Alert.alert('Error', axErr?.response?.data?.error?.message ?? 'Failed to cancel.');
    },
  });

  const handleNextStatus = () => {
    if (!booking) return;
    const next = NEXT_STATUS[booking.status];
    if (!next) return;

    if (next.confirm) {
      Alert.alert('Confirm', next.confirm, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes', onPress: () => statusMutation.mutate(next.status) },
      ]);
    } else {
      statusMutation.mutate(next.status);
    }
  };

  const handleCancel = () => {
    Alert.alert('Cancel Job', 'Are you sure you want to cancel this job?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, Cancel', style: 'destructive', onPress: () => cancelMutation.mutate() },
    ]);
  };

  const handleNavigate = () => {
    if (!booking?.latitude || !booking?.longitude) {
      Alert.alert('No Location', 'No GPS coordinates available for this job.');
      return;
    }
    const lat = booking.latitude;
    const lng = booking.longitude;
    const label = encodeURIComponent(booking.address);
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
    });
    if (url) void Linking.openURL(url);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.secondary} />
      </View>
    );
  }

  if (isError || !booking) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Failed to load job details.</Text>
        <Button title="Go Back" onPress={() => router.back()} variant="outline" />
      </View>
    );
  }

  const nextAction = NEXT_STATUS[booking.status];
  const canCancel = ['matched', 'paid'].includes(booking.status);
  const isActiveJob = ['paid', 'provider_en_route', 'provider_arrived', 'in_progress'].includes(booking.status);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Job Details</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.statusCard}>
          <Badge
            label={booking.status.replace(/_/g, ' ').toUpperCase()}
            backgroundColor={getStatusColor(booking.status)}
            size="md"
          />
          <Text style={styles.bookingId}>#{booking.id.slice(0, 8).toUpperCase()}</Text>
        </View>

        <Text style={styles.statusMessage}>
          {STATUS_LABELS[booking.status] ?? booking.status.replace(/_/g, ' ')}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Service</Text>
          <Text style={styles.serviceName}>{booking.serviceName ?? booking.categoryName ?? 'Service'}</Text>
          {booking.description && <Text style={styles.serviceDesc}>{booking.description}</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Schedule</Text>
          <Text style={styles.detailText}>{formatDateTime(booking.scheduledAt)}</Text>
          <Text style={styles.relativeText}>{formatRelative(booking.scheduledAt)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          <Text style={styles.detailText}>
            {booking.address}{booking.barangay !== 'N/A' ? `, ${booking.barangay}` : ''}, {booking.city}
          </Text>
          {booking.latitude && booking.longitude && (
            <TouchableOpacity onPress={handleNavigate} style={styles.navigateButton}>
              <Text style={styles.navigateIcon}>🗺️</Text>
              <Text style={styles.navigateText}>Open in Maps</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.earningsSection}>
          <Text style={styles.sectionTitle}>Earnings</Text>
          <View style={styles.earningsRow}>
            <Text style={styles.earningsLabel}>Service Price</Text>
            <Text style={styles.earningsValue}>{formatPHP(booking.servicePrice)}</Text>
          </View>
          <View style={styles.earningsDivider} />
          <View style={styles.earningsRow}>
            <Text style={styles.earningsTotalLabel}>Your Earnings</Text>
            <Text style={styles.earningsTotalValue}>{formatPHP(booking.servicePrice)}</Text>
          </View>
          <Text style={styles.earningsNote}>Commission will be deducted upon payout</Text>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.base }]}>
        {nextAction && (
          <Button
            title={statusMutation.isPending ? 'Updating...' : nextAction.label}
            onPress={handleNextStatus}
            loading={statusMutation.isPending}
            disabled={statusMutation.isPending || cancelMutation.isPending}
          />
        )}
        {isActiveJob && (
          <Button
            title="Chat with Customer"
            onPress={() => router.push(`/provider/chat/${booking.id}` as never)}
            variant="outline"
          />
        )}
        {canCancel && (
          <Button
            title="Cancel Job"
            onPress={handleCancel}
            variant="ghost"
            disabled={cancelMutation.isPending || statusMutation.isPending}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  errorText: { ...typography.body, color: colors.error, marginBottom: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm },
  backIcon: { fontSize: 24, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: 160 },

  statusCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  bookingId: { ...typography.caption, color: colors.textTertiary, fontWeight: '600' },
  statusMessage: { ...typography.h2, color: colors.text, marginBottom: spacing.lg },

  section: { marginBottom: spacing.lg },
  sectionTitle: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '600',
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  serviceName: { ...typography.h3, color: colors.text },
  serviceDesc: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  detailText: { ...typography.body, color: colors.text },
  relativeText: { ...typography.bodySmall, color: colors.textTertiary, marginTop: 2 },

  navigateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  navigateIcon: { fontSize: 20, marginRight: spacing.sm },
  navigateText: { ...typography.body, color: colors.secondary, fontWeight: '600' },

  earningsSection: {
    backgroundColor: colors.backgroundSecondary,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  earningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  earningsLabel: { ...typography.body, color: colors.textSecondary },
  earningsValue: { ...typography.body, color: colors.text, fontWeight: '500' },
  earningsDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  earningsTotalLabel: { ...typography.h3, color: colors.text },
  earningsTotalValue: { ...typography.price, color: colors.secondary },
  earningsNote: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },

  bottomBar: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.sm,
  },
});
