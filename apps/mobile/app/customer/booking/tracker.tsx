import React, { useEffect, useState, useRef } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import MapView, { Marker, type Region } from 'react-native-maps';
import { getBookingById } from '@/services/booking.service';
import { getSocket, connectSocket } from '@/services/socket.service';
import { Badge, Button } from '@/components/ui';
// Phase 14 R5-complete — PulsingDot live indicator for en-route status.
import PulsingDot from '@/components/PulsingDot';
import { formatRelative } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

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

const STATUS_COLORS: Record<string, string> = {
  matched: colors.statusConfirmed,
  paid: colors.statusConfirmed,
  provider_en_route: colors.statusInProgress,
  provider_arrived: colors.statusInProgress,
  in_progress: colors.statusInProgress,
  completed_by_provider: colors.statusCompleted,
  confirmed: colors.statusCompleted,
  disputed: colors.statusDisputed,
  resolved: colors.statusCompleted,
};

export default function BookingTrackerScreen(): React.ReactElement {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [providerLocation, setProviderLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const { data: booking, isLoading, isError } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBookingById(bookingId),
    enabled: !!bookingId,
    refetchInterval: 15000,
  });

  useEffect(() => {
    const socket = connectSocket();
    if (bookingId) {
      socket.on(`booking:${bookingId}:location`, (data: { latitude: number; longitude: number }) => {
        setProviderLocation(data);
      });
      socket.on(`booking:${bookingId}:status`, () => {
        // Status update will be caught by refetchInterval
      });
    }
    return () => {
      const s = getSocket();
      if (s && bookingId) {
        s.off(`booking:${bookingId}:location`);
        s.off(`booking:${bookingId}:status`);
      }
    };
  }, [bookingId]);

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
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError || (!isLoading && !booking)) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>
          Failed to load booking details.
        </Text>
        <Button title="Go Back" onPress={() => router.back()} variant="outline" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Track Booking</Text>
      </View>

      {/* Phase D CRIT-77 fix — fallback map center is Boracay
           (where the launch market is), not Manila. Pre-fix any
           booking missing coordinates centered on Manila so a
           Boracay tourist tracking their cleaner saw the wrong
           island. Coordinates: White Beach Station 1, Boracay
           (the most central point of the launch service area).
           Once we expand beyond Boracay, this can be the user's
           saved default address center via useDefaultLocation(). */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={bookingRegion ?? {
          latitude: 11.9685,
          longitude: 121.9162,
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
        {providerLocation && (
          <Marker
            coordinate={providerLocation}
            title="Provider"
            pinColor={colors.secondary}
          />
        )}
      </MapView>

      <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + spacing.base }]}>
        {booking && (
          <>
            <View style={styles.statusRow}>
              <Badge
                label={booking.status.replace(/_/g, ' ').toUpperCase()}
                backgroundColor={STATUS_COLORS[booking.status] ?? colors.statusPending}
                size="md"
              />
              {/* Phase 14 R5-complete — PulsingDot for live en-route/arrived */}
              {(booking.status === 'provider_en_route' || booking.status === 'provider_arrived') && (
                <PulsingDot />
              )}
              <Text style={styles.scheduledText}>{formatRelative(booking.scheduledAt)}</Text>
            </View>

            <Text style={styles.statusMessage}>
              {STATUS_LABELS[booking.status] ?? 'Tracking your booking'}
            </Text>

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
                >
                  <Text style={styles.chatIcon}>💬</Text>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text },
  map: { flex: 1 },

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
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  scheduledText: { ...typography.caption, color: colors.textTertiary },
  statusMessage: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  serviceName: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.base },

  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
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
