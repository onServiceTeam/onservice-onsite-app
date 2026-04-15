import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Linking, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import MapView, { Marker, type Region } from 'react-native-maps';
import { getBookingById } from '@/services/booking.service';
import { updateBookingStatus } from '@/services/provider-api.service';
import { Badge, Button } from '@/components/ui';
import { formatRelative } from '@/utils/date';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

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
  in_progress: { status: 'completed_by_provider', label: 'Mark Complete' },
};

export default function ActiveJobScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const mapRef = useRef<MapView>(null);

  const { data: booking, isLoading, isError } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBookingById(bookingId),
    enabled: !!bookingId,
    refetchInterval: 15000,
  });

  const statusMutation = useMutation({
    mutationFn: (newStatus: string) => updateBookingStatus(bookingId, newStatus),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['booking', bookingId] });
      void queryClient.invalidateQueries({ queryKey: ['providerJobs'] });
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      Alert.alert('Error', axErr?.response?.data?.error?.message ?? 'Failed to update status.');
    },
  });

  const handleAction = () => {
    if (!booking) return;
    const action = NEXT_ACTION[booking.status];
    if (!action) return;

    Alert.alert('Confirm', `Proceed to "${action.label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes', onPress: () => statusMutation.mutate(action.status) },
    ]);
  };

  const handleNavigateToJob = () => {
    if (!booking?.latitude || !booking?.longitude) return;
    const lat = booking.latitude;
    const lng = booking.longitude;
    const label = encodeURIComponent(booking.address);
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
    });
    if (url) void Linking.openURL(url);
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
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.secondary} />
      </View>
    );
  }

  if (isError || !booking) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={{ ...typography.body, color: colors.error, marginBottom: spacing.lg }}>
          Failed to load job details.
        </Text>
        <Button title="Go Back" onPress={() => router.back()} variant="outline" />
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

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={bookingRegion ?? {
          latitude: 14.5995,
          longitude: 120.9842,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {bookingRegion && (
          <Marker
            coordinate={{ latitude: bookingRegion.latitude, longitude: bookingRegion.longitude }}
            title="Job Location"
            pinColor={colors.secondary}
          />
        )}
      </MapView>

      <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + spacing.base }]}>
        <View style={styles.statusRow}>
          <Badge
            label={booking.status.replace(/_/g, ' ').toUpperCase()}
            backgroundColor={colors.statusInProgress}
            size="md"
          />
          <Text style={styles.timeText}>{formatRelative(booking.scheduledAt)}</Text>
        </View>

        <Text style={styles.statusMessage}>
          {STATUS_LABELS[booking.status] ?? 'Active job'}
        </Text>
        <Text style={styles.serviceName}>{booking.serviceName ?? 'Service'}</Text>
        <Text style={styles.addressText} numberOfLines={1}>
          📍 {booking.address}, {booking.city}
        </Text>

        <View style={styles.actionRow}>
          {action && (
            <Button
              title={statusMutation.isPending ? 'Updating...' : action.label}
              onPress={handleAction}
              loading={statusMutation.isPending}
              disabled={statusMutation.isPending}
              style={styles.actionButton}
            />
          )}
          {booking.status === 'provider_en_route' && booking.latitude && booking.longitude && (
            <TouchableOpacity style={styles.navButton} onPress={handleNavigateToJob}>
              <Text style={styles.navIcon}>🗺️</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.chatRow}
          onPress={() => router.push(`/provider/chat/${booking.id}` as never)}
        >
          <Text style={styles.chatIcon}>💬</Text>
          <Text style={styles.chatText}>Chat with Customer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
  backButton: { padding: spacing.sm, marginRight: spacing.sm },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text },
  map: { flex: 1 },

  bottomSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.base,
    shadowColor: '#000',
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
  timeText: { ...typography.caption, color: colors.textTertiary },
  statusMessage: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  serviceName: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xs },
  addressText: { ...typography.bodySmall, color: colors.textTertiary, marginBottom: spacing.base },

  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  actionButton: { flex: 1 },
  navButton: {
    width: 50,
    height: 50,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIcon: { fontSize: 24 },

  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
  },
  chatIcon: { fontSize: 18, marginRight: spacing.sm },
  chatText: { ...typography.body, color: colors.secondary, fontWeight: '600' },
});
