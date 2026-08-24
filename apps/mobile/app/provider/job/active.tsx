import React, { useRef } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import MapView, { Marker, type Region } from 'react-native-maps';
import { getBookingById } from '@/services/booking.service';
import { updateBookingStatus } from '@/services/provider-api.service';
import { getMyStaff, assignStaffToBooking } from '@/services/provider-staff.service';
import { Button, SkeletonCard, ErrorState, StatusBadge } from '@/components/ui';
import { showToast } from '@/lib/toast';
import { formatRelative } from '@/utils/date';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { MapIcon, MapPin, MessageSquare } from '@/components/icons';
import { useLocation } from '@/hooks/useLocation';
import { buildRoute, Routes } from '@/config/navigation';
import { useResponsive } from '@/hooks/useResponsive';

const STATUS_LABELS: Record<string, string> = {
  paid: 'Navigate to job',
  provider_en_route: 'On the way',
  provider_arrived: 'You\'ve arrived',
  in_progress: 'Service in progress',
  completed_by_provider: 'Waiting for customer confirmation',
};

const NEXT_ACTION: Record<string, { status: string; label: string }> = {
  paid: { status: 'provider_en_route', label: 'Start Navigation' },
  provider_en_route: { status: 'provider_arrived', label: 'I\'ve Arrived' },
  provider_arrived: { status: 'in_progress', label: 'Start Service' },
  in_progress: { status: 'completed_by_provider', label: 'Review & Complete' },
};

export default function ActiveJobScreen(): React.ReactElement {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isPhone } = useResponsive();
  const mapRef = useRef<MapView>(null);
  const { getCurrentLocation, isLoading: isGettingLocation } = useLocation();

  const { data: booking, isLoading, isError, refetch } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBookingById(bookingId),
    enabled: !!bookingId,
    refetchInterval: 15000,
  });

  // D23 — approved team members the provider can assign this job to.
  const { data: staff } = useQuery({
    queryKey: ['providerStaff'],
    queryFn: getMyStaff,
    staleTime: 60 * 1000,
  });
  const approvedStaff = (staff ?? []).filter((m) => m.status === 'approved');

  const assignMutation = useMutation({
    mutationFn: (staffId: string | null) => assignStaffToBooking(bookingId, staffId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['booking', bookingId] });
    },
    onError: (err: unknown) => showToast(getErrorMessage(err, 'Could not assign this job.'), 'error'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ newStatus, location }: { newStatus: string; location?: { latitude: number; longitude: number } }) =>
      updateBookingStatus(bookingId, newStatus, undefined, location),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['booking', bookingId] });
      void queryClient.invalidateQueries({ queryKey: ['providerJobs'] });
    },
    onError: (err: unknown) => {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper (A7: non-blocking toast).
      showToast(getErrorMessage(err, 'Failed to update status.'), 'error');
    },
  });

  const handleAction = (): void => {
    if (!booking) return;
    const action = NEXT_ACTION[booking.status];
    if (!action) return;

    // UX-155 — completion is a documented workflow, not a direct status
    // button. The completion screen collects canonical after-photo evidence,
    // notes, and the currently configured acceptance step before the API runs
    // its checklist/photo gates. Direct mutation here either failed those gates
    // or bypassed the evidence UI when prior evidence happened to exist.
    if (action.status === 'completed_by_provider') {
      router.push(buildRoute(Routes.PROVIDER.JOB_COMPLETE, { id: booking.id }) as never);
      return;
    }

    const submitAction = async (): Promise<void> => {
      let location: { latitude: number; longitude: number } | undefined;
      if (action.status === 'provider_arrived') {
        location = await getCurrentLocation() ?? undefined;
        if (!location) return;
      }
      statusMutation.mutate({ newStatus: action.status, location });
    };

    Alert.alert('Confirm', `Proceed to "${action.label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes', onPress: () => { void submitAction(); } },
    ]);
  };

  const handleNavigateToJob = (): void => {
    if (!booking) return;
    router.push(buildRoute(Routes.PROVIDER.JOB_NAVIGATE, { id: booking.id }) as never);
  };

  const bookingRegion: Region | undefined = booking?.latitude && booking?.longitude
    ? {
        latitude: Number(booking.latitude),
        longitude: Number(booking.longitude),
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }
    : undefined;

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.base }]}>
        <View style={{ padding: spacing.base }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  if (isError || !booking) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ErrorState
          message="We couldn't load this job's details. Please check your connection and try again."
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  const action = NEXT_ACTION[booking.status];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Active Job</Text>
      </View>

      <View
        style={[styles.workspace, !isPhone && styles.workspaceWide]}
        accessibilityLabel={isPhone ? 'Active provider job' : 'Tablet and desktop active provider job workspace'}
      >
      {bookingRegion ? (
        <MapView
          ref={mapRef}
          style={[styles.map, !isPhone && styles.mapWide]}
          initialRegion={bookingRegion}
        >
          <Marker
            coordinate={{ latitude: bookingRegion.latitude, longitude: bookingRegion.longitude }}
            title="Job Location"
            pinColor={colors.secondary}
          />
        </MapView>
      ) : (
        <View style={[styles.map, styles.mapUnavailable, !isPhone && styles.mapWide]}>
          <MapIcon size={42} color={colors.textTertiary} />
          <Text style={styles.mapUnavailableTitle}>Job coordinates unavailable</Text>
          <Text style={styles.mapUnavailableText}>Use the address-based Directions action. No map pin or route is shown until the booking has verified coordinates.</Text>
        </View>
      )}

      <ScrollView
        style={[styles.sheetScroll, !isPhone && styles.sheetScrollWide]}
        contentContainerStyle={[styles.bottomSheet, !isPhone && styles.bottomSheetWide, { paddingBottom: insets.bottom + spacing.base }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statusRow}>
          <StatusBadge status={booking.status} size="md" />
          <Text style={styles.timeText}>{formatRelative(booking.scheduledAt)}</Text>
        </View>

        <Text style={styles.statusMessage}>
          {STATUS_LABELS[booking.status] ?? 'Active job'}
        </Text>
        <Text style={styles.serviceName}>{booking.serviceName ?? 'Service'}</Text>
        <View style={styles.addressRow}>
          <MapPin size={14} color={colors.textTertiary} style={{ marginRight: 4 }} />
          <Text style={styles.addressText} numberOfLines={1}>
            {[booking.address, booking.barangay, booking.city].filter(Boolean).join(', ')}
          </Text>
        </View>

        <View style={styles.actionRow}>
          {action && (
            <Button
              title={isGettingLocation ? 'Getting location...' : statusMutation.isPending ? 'Updating...' : action.label}
              onPress={handleAction}
              loading={statusMutation.isPending}
              disabled={statusMutation.isPending || isGettingLocation}
              style={styles.actionButton}
            />
          )}
          {booking.status === 'provider_en_route'
            && ((booking.latitude != null && booking.longitude != null) || booking.address)
            && (
            <TouchableOpacity
              style={styles.navButton}
              onPress={handleNavigateToJob}
              accessibilityRole="button"
              accessibilityLabel="Open directions"
            >
              <MapIcon size={22} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.chatRow}
          onPress={() => router.push(`/provider/chat/${booking.id}`)}
        >
          <MessageSquare size={18} color={colors.secondary} style={styles.chatIcon} />
          <Text style={styles.chatText}>Chat with Customer</Text>
        </TouchableOpacity>

        {approvedStaff.length > 0 && (
          <View style={styles.assignSection}>
            <Text style={styles.assignLabel}>Who's doing this job?</Text>
            <View style={styles.assignChips}>
              <TouchableOpacity
                style={[styles.assignChip, !booking.performerStaffId && styles.assignChipActive]}
                onPress={() => assignMutation.mutate(null)}
                disabled={assignMutation.isPending}
              >
                <Text style={[styles.assignChipText, !booking.performerStaffId && styles.assignChipTextActive]}>Me</Text>
              </TouchableOpacity>
              {approvedStaff.map((m) => {
                const active = booking.performerStaffId === m.id;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.assignChip, active && styles.assignChipActive]}
                    onPress={() => assignMutation.mutate(m.id)}
                    disabled={assignMutation.isPending}
                  >
                    <Text style={[styles.assignChipText, active && styles.assignChipTextActive]}>
                      {m.userName || m.roleTitle || 'Team member'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text },
  map: { flex: 1 },
  mapWide: { borderRadius: borderRadius.lg, overflow: 'hidden' },
  workspace: { flex: 1 },
  workspaceWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: 76,
    paddingBottom: spacing.xl,
    width: '100%',
    maxWidth: 1360,
    alignSelf: 'center',
  },
  mapUnavailable: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.backgroundSecondary,
  },
  mapUnavailableTitle: { ...typography.h3, color: colors.text, marginTop: spacing.md, textAlign: 'center' },
  mapUnavailableText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.xs, maxWidth: 440, textAlign: 'center' },
  sheetScroll: { flexGrow: 0 },
  sheetScrollWide: { width: 420, flexGrow: 0, borderRadius: borderRadius.lg },

  bottomSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.base,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  bottomSheetWide: { minHeight: '100%', borderRadius: borderRadius.lg },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  timeText: { ...typography.caption, color: colors.textTertiary },
  statusMessage: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  serviceName: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xs },
  addressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.base },
  addressText: { ...typography.bodySmall, color: colors.textTertiary, flex: 1 },

  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  actionButton: { flex: 1 },
  navButton: {
    width: 50,
    height: 50,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIcon: { fontSize: 24 },

  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chatIcon: { marginRight: spacing.sm },
  chatText: { ...typography.body, color: colors.secondary, fontWeight: '600' },

  assignSection: { marginTop: spacing.base, paddingTop: spacing.base, borderTopWidth: 1, borderTopColor: colors.border },
  assignLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  assignChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  assignChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: 20, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  assignChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  assignChipText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  assignChipTextActive: { color: colors.primary },
});
