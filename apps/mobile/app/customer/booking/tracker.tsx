import React, { useEffect, useRef, useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import MapView, { Marker, type Region } from 'react-native-maps';
import { getBookingById } from '@/services/booking.service';
import { getSocket, connectSocket } from '@/services/socket.service';
// A7 — shared UI kit for loading/error states.
import { Button, StatusBadge, SkeletonCard, ErrorState } from '@/components/ui';
// Phase 14 R5-complete — PulsingDot live indicator for en-route status.
import PulsingDot from '@/components/PulsingDot';
import { formatRelative } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { MessageSquare, ChevronLeft } from '@/components/icons';
import { useResponsive } from '@/hooks/useResponsive';

const STATUS_LABELS: Record<string, string> = {
  matched: 'Waiting for provider',
  paid: 'Payment confirmed',
  provider_en_route: 'Provider is on the way',
  provider_arrived: 'Provider has arrived',
  in_progress: 'Service in progress',
  completed_by_provider: 'Awaiting your confirmation',
  confirmed: 'Job confirmed',
  disputed: 'Dispute in progress',
  resolved: 'Dispute resolved',
};


export default function BookingTrackerScreen(): React.ReactElement {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();
  const mapRef = useRef<MapView>(null);
  const [providerLocation, setProviderLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Phase 106 decision (kept) — the customer-side listener for live provider
  // GPS stays wired so v1.1 only needs to land the server producer. The
  // events never fire today, so providerLocation stays null and no provider
  // pin is drawn; the screen is honest about this (see the hint below and
  // LAUNCH-LIMITATIONS section 32). Do NOT remove this without removing the
  // v1.1 plan; a regression guard protects it (bug-phase106-01 test).
  useEffect(() => {
    if (!bookingId) return;
    const socket = connectSocket();
    socket.on(`booking:${bookingId}:location`, (data: { latitude: number; longitude: number }) => {
      setProviderLocation(data);
    });
    return () => {
      const s = getSocket();
      if (s) s.off(`booking:${bookingId}:location`);
    };
  }, [bookingId]);

  const { data: booking, isLoading, isError, refetch } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBookingById(bookingId),
    enabled: !!bookingId,
    // Phase 200 — poll for status changes only while the booking is still
    // live. Once it reaches a terminal state, stop refetching. (Live provider
    // GPS movement is a v1.1 feature pending the location-ping pipeline; the
    // map shows the service location and status updates here automatically.)
    refetchInterval: (query) => {
      const status = (query.state.data as { status?: string } | undefined)?.status;
      const TERMINAL = ['confirmed', 'resolved', 'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin', 'paid_out'];
      return status && TERMINAL.includes(status) ? false : 15000;
    },
  });

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
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={{ padding: spacing.base }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  if (isError || (!isLoading && !booking)) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ErrorState
          message="We couldn't load this booking. Please check your connection and try again."
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, !isPhone && styles.headerWide, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Track Booking</Text>
      </View>

      <View
        style={[styles.trackerWorkspace, !isPhone && styles.trackerWorkspaceWide]}
        accessibilityLabel={isPhone ? 'Booking tracker' : 'Booking tracking workspace'}
      >
      {/* Phase 200 (Cebu launch) — fallback map center is central Cebu City
           (the launch market), used only when a booking is missing
           coordinates. Once we expand beyond Cebu, this can become the
           user's saved default address center via useDefaultLocation(). */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={bookingRegion ?? {
          latitude: 10.3157,
          longitude: 123.8854,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {bookingRegion && (
          <Marker
            coordinate={{ latitude: bookingRegion.latitude, longitude: bookingRegion.longitude }}
            title="Service Location"
            pinColor={colors.primary}
          />
        )}
        {/* Provider pin only renders if a real live-location event arrives.
            That producer is a v1.1 feature, so today this never shows — it is
            wired so v1.1 only needs the server side (Phase 106 decision). */}
        {providerLocation && (
          <Marker
            coordinate={providerLocation}
            title="Provider"
            pinColor={colors.secondary}
          />
        )}
      </MapView>

      <View
        style={[
          styles.bottomSheet,
          !isPhone && styles.summaryPanelWide,
          { paddingBottom: insets.bottom + spacing.base },
        ]}
        accessibilityLabel={isPhone ? 'Booking status and provider' : 'Booking tracking status and actions'}
      >
        {booking && (
          <>
            <View style={styles.statusRow}>
              <StatusBadge status={booking.status} size="md" />
              {/* Phase 14 R5-complete — PulsingDot for live en-route/arrived */}
              {(booking.status === 'provider_en_route' || booking.status === 'provider_arrived') && (
                <PulsingDot />
              )}
              <Text style={styles.scheduledText}>{formatRelative(booking.scheduledAt)}</Text>
            </View>

            <Text style={styles.statusMessage}>
              {STATUS_LABELS[booking.status] ?? 'Tracking your booking'}
            </Text>

            {(booking.status === 'provider_en_route' || booking.status === 'provider_arrived') && (
              <Text style={styles.trackHint}>
                The pin shows your service location. Status updates automatically — message your provider for a live ETA.
              </Text>
            )}

            <Text style={styles.serviceName}>{booking.serviceName ?? 'Service'}</Text>

            {booking.providerName && (
              <View style={styles.providerRow}>
                <View style={styles.providerAvatar}>
                  <Text style={styles.providerInitial}>{booking.providerName[0]?.toUpperCase()}</Text>
                </View>
                <View style={styles.providerInfo}>
                  <Text style={styles.providerName}>{booking.providerName}</Text>
                  <Text style={styles.providerLabel}>Your Provider</Text>
                </View>
                <TouchableOpacity
                  style={styles.chatButton}
                  onPress={() => router.push(`/customer/chat/${booking.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel="Chat with provider"
                >
                  <MessageSquare size={20} color={colors.primary} />
                </TouchableOpacity>
              </View>
            )}

            {booking.status === 'completed_by_provider' && (
              <Button
                title="Confirm Job Complete"
                onPress={() => router.push(`/customer/booking/complete?bookingId=${bookingId}`)}
              />
            )}
          </>
        )}
      </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  centered: { alignItems: 'center', justifyContent: 'center' },
  errorText: { ...typography.body, color: colors.error, marginBottom: spacing.lg },
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
  headerWide: {
    position: 'relative',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text },
  trackerWorkspace: { flex: 1 },
  trackerWorkspaceWide: { flexDirection: 'row' },
  map: { flex: 1, minWidth: 0 },

  bottomSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.base,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  summaryPanelWide: {
    width: 360,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    shadowOpacity: 0,
    elevation: 0,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  scheduledText: { ...typography.caption, color: colors.textTertiary },
  statusMessage: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  trackHint: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  serviceName: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.base },

  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.base,
  },
  providerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  providerInitial: { color: colors.white, fontWeight: '700', fontSize: 18 },
  providerInfo: { flex: 1 },
  providerName: { ...typography.body, color: colors.text, fontWeight: '600' },
  providerLabel: { ...typography.caption, color: colors.textTertiary },
  chatButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatIcon: { fontSize: 20 },
});
