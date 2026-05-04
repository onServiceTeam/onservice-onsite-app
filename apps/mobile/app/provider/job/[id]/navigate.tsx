import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { getBookingById } from '@/services/booking.service';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import {
  ArrowLeft,
  MapPin,
  Navigation,
  CheckCircle2,
} from '@/components/icons';

// BUG-PHASE59-02 fix — pre-fix this screen ALWAYS used a hardcoded
// fallback ("Maria Santos, 123 Sample St, Quezon City") regardless
// of the actual booking. The `id` param was never read to fetch
// the real customer + address. Provider tapping "Open in Google
// Maps" got directions to a placeholder address — they could
// drive to the wrong place entirely. The "Mark Arrived" button
// DID hit the right /:id/arrived endpoint, so the booking would
// transition correctly even though the provider was elsewhere.
// Now: useQuery fetches the booking and the screen uses the real
// fields (with a clear loading + error state).

export default function NavigateToJobScreen(): React.ReactElement {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [marking, setMarking] = useState(false);

  const bookingQuery = useQuery({
    queryKey: ['booking', id],
    queryFn: () => getBookingById(id ?? ''),
    enabled: !!id,
  });
  const booking = bookingQuery.data;

  const customerName = booking?.providerName /* legacy alias */
    ?? (booking as unknown as { customerName?: string } | undefined)?.customerName
    ?? '(customer)';
  const fullAddressParts = booking
    ? [booking.address, booking.barangay, booking.city, booking.province].filter(Boolean)
    : [];
  const fullAddress = fullAddressParts.join(', ');
  const encodedAddress = encodeURIComponent(fullAddress);
  // Prefer GPS coords when available — more accurate than address text.
  const hasCoords = booking?.latitude != null && booking?.longitude != null;
  const coordParam = hasCoords
    ? `${booking!.latitude},${booking!.longitude}`
    : encodedAddress;
  const googleMapsUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${coordParam}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;
  const wazeUrl = hasCoords
    ? `https://waze.com/ul?ll=${coordParam}&navigate=yes`
    : `https://waze.com/ul?q=${encodedAddress}&navigate=yes`;

  const openExternal = async (url: string, label: string): Promise<void> => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert(label, `Cannot open ${label}. Please install the app or check your browser.`);
        return;
      }
      await Linking.openURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert(label, `Failed to open ${label}: ${msg}`);
    }
  };

  const handleArrived = async (): Promise<void> => {
    if (!id) {
      Alert.alert('Missing Job', 'No job ID provided.');
      return;
    }
    setMarking(true);
    try {
      await api.post(`/api/v1/bookings/${id}/arrived`);
      router.back();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update arrival status.';
      Alert.alert('Failed', msg);
    } finally {
      setMarking(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.7}>
          <ArrowLeft size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Navigate to Job</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {bookingQuery.isLoading && (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginBottom: spacing.base }} />
        )}
        {bookingQuery.isError && (
          <View style={[styles.addressCard, { backgroundColor: colors.errorLight, borderColor: colors.error }]}>
            <Text style={{ color: colors.error, ...typography.bodySmall }}>
              Could not load this job. Please go back and try again.
            </Text>
          </View>
        )}
        {!bookingQuery.isLoading && !bookingQuery.isError && (
          <View style={styles.addressCard}>
            <View style={styles.addressIconWrap}>
              <MapPin size={22} color={colors.primary} />
            </View>
            <View style={styles.addressInfo}>
              <Text style={styles.customerName}>{customerName}</Text>
              <Text style={styles.addressText}>{fullAddress || '(no address on file)'}</Text>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>Open in maps app</Text>

        <TouchableOpacity
          style={styles.mapBtn}
          onPress={() => openExternal(googleMapsUrl, 'Google Maps')}
          activeOpacity={0.7}
        >
          <Navigation size={22} color={colors.white} />
          <Text style={styles.mapBtnText}>Open in Google Maps</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.mapBtn, styles.wazeBtn]}
          onPress={() => openExternal(wazeUrl, 'Waze')}
          activeOpacity={0.7}
        >
          <Navigation size={22} color={colors.white} />
          <Text style={styles.mapBtnText}>Open in Waze</Text>
        </TouchableOpacity>

        {/* BUG-PHASE59-02 — pre-fix this card showed a hardcoded
             "ETA: ~25 min" regardless of real distance. The
             external maps app provides real ETA. Removing the
             fake card prevents misleading the provider; can be
             added back once we wire a real distance/duration
             query (Google Distance Matrix or Mapbox Directions). */}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.arrivedBtn, marking && styles.arrivedBtnDisabled]}
          onPress={handleArrived}
          activeOpacity={0.7}
          disabled={marking}
        >
          {marking ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <CheckCircle2 size={20} color={colors.white} />
              <Text style={styles.arrivedBtnText}>Mark Arrived</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h3, color: colors.text },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: spacing.xl },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addressIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  addressInfo: { flex: 1 },
  customerName: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: 4 },
  addressText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.md,
  },
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  wazeBtn: { backgroundColor: colors.info },
  mapBtnText: { ...typography.button, color: colors.white },
  etaCard: {
    backgroundColor: colors.successLight,
    borderRadius: borderRadius.md,
    padding: spacing.base,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  etaLabel: {
    ...typography.caption,
    color: colors.successDark,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  etaValue: { ...typography.h3, color: colors.successDark },
  footer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  arrivedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.base,
  },
  arrivedBtnDisabled: { opacity: 0.6 },
  arrivedBtnText: { ...typography.button, color: colors.white },
});
