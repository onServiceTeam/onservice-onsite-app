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
import { getBookingById } from '@/services/booking.service';
import { updateBookingStatus } from '@/services/provider-api.service';
import { useLocation } from '@/hooks/useLocation';
import { getErrorMessage } from '@/utils/errors';
// A7 — shared UI kit for loading/error states.
import { SkeletonCard, ErrorState, SectionHeader } from '@/components/ui';
import { colors, spacing, typography, borderRadius, getCategoryTint } from '@/config/theme';
import {
  ArrowLeft,
  MapPin,
  Navigation,
  CheckCircle2,
} from '@/components/icons';
import { useResponsive } from '@/hooks/useResponsive';

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
  const { getCurrentLocation, isLoading: locating } = useLocation();
  const { isPhone } = useResponsive();

  const bookingQuery = useQuery({
    queryKey: ['booking', id],
    queryFn: () => getBookingById(id ?? ''),
    enabled: !!id,
  });
  const booking = bookingQuery.data;

  // BUG-PHASE77-01 fix — pre-fix this read `booking?.providerName`
  // first ("legacy alias") which is the PROVIDER's name (themselves)
  // since the API joins the providers table to compute it. The
  // provider was seeing their own name labeled as the customer
  // contact on the navigate screen. Server now returns customerName
  // from a JOIN on users by booking.customer_id. Use it directly.
  const customerName = booking?.customerName ?? '(customer)';
  // App design refresh — soft per-category accent for the location pin chip;
  // falls back to brand teal for unknown categories.
  const tint = getCategoryTint(booking?.categoryName);
  const fullAddressParts = booking
    ? [booking.address, booking.barangay, booking.city, booking.province].filter(Boolean)
    : [];
  const fullAddress = fullAddressParts.join(', ');
  const encodedAddress = encodeURIComponent(fullAddress);
  // Prefer GPS coords when available — more accurate than address text.
  const hasCoords = booking?.latitude != null && booking?.longitude != null;
  const hasDestination = hasCoords || fullAddress.length > 0;
  const canMarkArrived = booking?.status === 'provider_en_route' && hasCoords;
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
      const loc = await getCurrentLocation();
      if (!loc) {
        Alert.alert('Location needed', 'We need your current location to mark arrival.');
        return;
      }
      // Server verifies the provider is within the arrival radius of the job.
      await updateBookingStatus(id, 'provider_arrived', undefined, {
        latitude: loc.latitude,
        longitude: loc.longitude,
      });
      router.back();
    } catch (err) {
      Alert.alert('Failed', getErrorMessage(err, 'Could not update arrival status.'));
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
        contentContainerStyle={[styles.bodyContent, !isPhone && styles.bodyContentWide]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[styles.workspace, !isPhone && styles.workspaceWide]}
          accessibilityLabel={isPhone ? 'Job directions' : 'Desktop job directions workspace'}
        >
          <View style={styles.jobColumn}>
            {bookingQuery.isLoading && (
              <View style={{ marginBottom: spacing.base }}>
                <SkeletonCard />
              </View>
            )}
            {bookingQuery.isError && (
              <ErrorState
                compact
                message="We couldn't load this job. Please check your connection and try again."
                onRetry={() => void bookingQuery.refetch()}
              />
            )}
            {!bookingQuery.isLoading && !bookingQuery.isError && booking && (
              <View style={styles.addressCard}>
                <View style={[styles.addressIconWrap, { backgroundColor: tint.bg }]}>
                  <MapPin size={22} color={tint.fg} />
                </View>
                <View style={styles.addressInfo}>
                  <Text style={styles.customerName}>{customerName}</Text>
                  <Text style={styles.addressText}>{fullAddress || '(no address on file)'}</Text>
                </View>
              </View>
            )}
          </View>

          <View style={styles.actionColumn}>
            <SectionHeader title="Open in maps app" />

            {bookingQuery.isLoading && <SkeletonCard />}

            {!bookingQuery.isLoading && !bookingQuery.isError && booking && !hasDestination && (
              <View style={styles.destinationNotice} accessibilityLabel="Missing job destination">
                <Text style={styles.destinationNoticeTitle}>No usable destination yet</Text>
                <Text style={styles.destinationNoticeText}>
                  This booking has neither GPS coordinates nor a service address. Contact the
                  customer before travelling and ask support to correct the booking if needed.
                </Text>
              </View>
            )}

            {!bookingQuery.isLoading && !bookingQuery.isError && booking && hasDestination && (
              <>
                <TouchableOpacity
                  style={styles.mapBtn}
                  onPress={() => openExternal(googleMapsUrl, 'Google Maps')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Open directions in Google Maps"
                >
                  <Navigation size={22} color={colors.white} />
                  <Text style={styles.mapBtnText}>Open in Google Maps</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.mapBtn, styles.wazeBtn]}
                  onPress={() => openExternal(wazeUrl, 'Waze')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Open directions in Waze"
                >
                  <Navigation size={22} color={colors.white} />
                  <Text style={styles.mapBtnText}>Open in Waze</Text>
                </TouchableOpacity>
              </>
            )}

            {!bookingQuery.isLoading && !bookingQuery.isError && booking && hasDestination && (
              <Text style={styles.mapsNote}>
                Maps opens outside onService. Check the customer’s written address before you leave.
              </Text>
            )}
          </View>
        </View>
      </ScrollView>

      {booking?.status === 'provider_en_route' && (
        <View style={[styles.footer, !isPhone && styles.footerWide]}>
          <View style={!isPhone ? styles.footerActionWide : undefined}>
            <TouchableOpacity
              style={[
                styles.arrivedBtn,
                (!canMarkArrived || marking || locating) && styles.arrivedBtnDisabled,
              ]}
              onPress={handleArrived}
              activeOpacity={0.7}
              disabled={!canMarkArrived || marking || locating}
              accessibilityRole="button"
              accessibilityLabel="Mark arrived at job"
              accessibilityState={{ disabled: !canMarkArrived || marking || locating }}
            >
              {(marking || locating) ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <CheckCircle2 size={20} color={colors.white} />
                  <Text style={styles.arrivedBtnText}>Mark Arrived</Text>
                </>
              )}
            </TouchableOpacity>
            {!hasCoords && (
              <Text style={styles.arrivalNote}>
                Arrival verification needs GPS coordinates on the booking. Contact support before
                attempting to start the service.
              </Text>
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h3, color: colors.text },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: spacing.xl },
  bodyContentWide: { width: '100%', maxWidth: 1040, alignSelf: 'center', padding: spacing.xl },
  workspace: { width: '100%', gap: spacing.base },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  jobColumn: { flex: 1, minWidth: 0 },
  actionColumn: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
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
  destinationNotice: {
    backgroundColor: colors.warningLight,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
  },
  destinationNoticeTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  destinationNoticeText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.xs },
  mapsNote: { ...typography.caption, color: colors.textTertiary, lineHeight: 18 },
  footer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerWide: { alignItems: 'flex-end', paddingHorizontal: spacing.xl },
  footerActionWide: { width: 360 },
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
  arrivalNote: { ...typography.caption, color: colors.error, lineHeight: 18, marginTop: spacing.sm },
});
