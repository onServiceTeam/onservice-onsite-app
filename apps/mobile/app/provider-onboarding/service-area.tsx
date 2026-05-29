import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { Button, Input } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

import { Routes } from '@/config/navigation';
const RADIUS_OPTIONS = [5, 10, 15, 20, 30, 50];

// Phase 200 (Cebu launch) — Metro Cebu is the launch market, so the four
// Cebu cities are listed FIRST (the nearest-match geocode and the first
// suggestions shown should favour the launch metro). Other PH cities remain
// so the app still works for nationwide address entry and future expansion.
const PH_REGIONS: { city: string; province: string; lat: number; lng: number }[] = [
  { city: 'Cebu City', province: 'Cebu', lat: 10.3157, lng: 123.8854 },
  { city: 'Mandaue', province: 'Cebu', lat: 10.3236, lng: 123.9223 },
  { city: 'Lapu-Lapu', province: 'Cebu', lat: 10.3103, lng: 123.9494 },
  { city: 'Talisay', province: 'Cebu', lat: 10.2447, lng: 123.8494 },
  { city: 'Quezon City', province: 'Metro Manila', lat: 14.6760, lng: 121.0437 },
  { city: 'Manila', province: 'Metro Manila', lat: 14.5995, lng: 120.9842 },
  { city: 'Makati', province: 'Metro Manila', lat: 14.5547, lng: 121.0244 },
  { city: 'Davao City', province: 'Davao del Sur', lat: 7.1907, lng: 125.4553 },
  { city: 'Pasig', province: 'Metro Manila', lat: 14.5764, lng: 121.0851 },
  { city: 'Taguig', province: 'Metro Manila', lat: 14.5176, lng: 121.0509 },
  { city: 'Iloilo City', province: 'Iloilo', lat: 10.7202, lng: 122.5621 },
  { city: 'Boracay', province: 'Aklan', lat: 11.9685, lng: 121.9162 },
];

export default function ServiceAreaScreen(): React.ReactElement {
  const router = useRouter();
  const store = useOnboardingStore();
  const [radius, setRadius] = useState(store.serviceRadiusKm);
  const [city, setCity] = useState(store.city);
  const [province, setProvince] = useState(store.province);
  const [lat, setLat] = useState<number | null>(store.latitude);
  const [lng, setLng] = useState<number | null>(store.longitude);
  // BUG-PHASE62-02 fix — pre-fix the K06 alert told the user to
  // "Tap 'Use My Current Location'" but no such button existed on
  // this screen. Provider got an actionable-sounding error pointing
  // to an affordance that wasn't there. Now: real GPS button using
  // expo-location, populates lat/lng + mirrors to a basic city/
  // province display so the user can verify before proceeding.
  const [locating, setLocating] = useState(false);
  const useCurrentLocation = async (): Promise<void> => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(
          'Permission denied',
          'Allow location access in your device settings to use this feature.',
        );
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLat(loc.coords.latitude);
      setLng(loc.coords.longitude);
      // Best-effort reverse geocode to populate city/province text.
      try {
        const places = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        const place = places[0];
        if (place) {
          if (!city.trim() && place.city) setCity(place.city);
          if (!province.trim() && place.region) setProvince(place.region);
        }
      } catch { /* reverse geocode best-effort */ }
      Alert.alert('Got it', 'Location captured. You can adjust the city/province fields if needed.');
    } catch {
      Alert.alert('Location unavailable', 'Could not get your current location on this device.');
    } finally {
      setLocating(false);
    }
  };

  const selectCity = (item: typeof PH_REGIONS[0]): void => {
    setCity(item.city);
    setProvince(item.province);
    setLat(item.lat);
    setLng(item.lng);
  };

  const handleNext = (): void => {
    if (city.trim().length < 1 || province.trim().length < 1) {
      Alert.alert('Required', 'City and province are required.');
      return;
    }

    let finalLat = lat;
    let finalLng = lng;
    if (!finalLat || !finalLng) {
      const match = PH_REGIONS.find((r) => r.city.toLowerCase() === city.trim().toLowerCase());
      if (match) {
        finalLat = match.lat;
        finalLng = match.lng;
      } else {
        // Phase K MED-K06 fix — pre-fix unknown cities defaulted to
        // Manila (14.5995, 120.9842), so a Boracay / Cebu / Davao
        // applicant whose city wasn't in the small PH_REGIONS list
        // silently submitted Manila coordinates and the matching
        // service then rejected them as out-of-range. Post-fix:
        // refuse to submit; ask the user to use the GPS pin so the
        // device-level coordinates are captured. The server-side
        // PH lat/lng band check (validators/ph-coords.ts) will then
        // accept anywhere within the country, not just Metro Manila.
        Alert.alert(
          'Pin your location',
          `We don't have map data for "${city.trim()}". Tap "Use My Current Location" so we can capture your coordinates accurately. (You can still type the city + province above; we just need the GPS pin too.)`,
        );
        return;
      }
    }

    store.setServiceArea({
      radiusKm: radius,
      lat: finalLat,
      lng: finalLng,
      city: city.trim(),
      province: province.trim(),
    });
    router.push(Routes.PROVIDER_ONBOARDING.DOCUMENTS);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.progress}>
          <View style={[styles.progressDot, styles.progressDone]} />
          <View style={[styles.progressDot, styles.progressActive]} />
          <View style={styles.progressDot} />
          <View style={styles.progressDot} />
          <View style={styles.progressDot} />
        </View>
        <Text style={styles.step}>2 / 5</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>Service Area</Text>
        <Text style={styles.subtitle}>Select your city and set how far you can travel for jobs.</Text>

        <Text style={styles.cityPickerLabel}>Select your city</Text>
        <View style={styles.cityGrid}>
          {PH_REGIONS.map((item) => (
            <TouchableOpacity
              key={`${item.city}-${item.province}`}
              style={[styles.cityChip, city === item.city && styles.cityChipActive]}
              onPress={() => selectCity(item)}
              activeOpacity={0.7}
            >
              <Text style={[styles.cityChipText, city === item.city && styles.cityChipTextActive]}>
                {item.city}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* BUG-PHASE149-01 fix — pre-fix City + Province inputs had
            no maxLength. Server's providerApplicationSchema caps both
            at max(100) (provider.validators.ts:29-30). Same fix shape
            as Phase 148 (customer addresses). */}
        <Input label="City" placeholder="e.g. Quezon City" value={city} onChangeText={(v) => { setCity(v); setLat(null); setLng(null); }} maxLength={100} />
        <Input label="Province" placeholder="e.g. Metro Manila" value={province} onChangeText={setProvince} maxLength={100} />

        {/* BUG-PHASE62-02 — real "Use My Current Location" button
             matching the K06 alert message. */}
        <TouchableOpacity
          style={styles.locateBtn}
          onPress={() => { void useCurrentLocation(); }}
          disabled={locating}
          activeOpacity={0.7}
        >
          {locating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.locateBtnText}>📍 Use My Current Location</Text>
          )}
        </TouchableOpacity>
        {lat != null && lng != null && (
          <Text style={styles.locateHint}>
            GPS captured: {lat.toFixed(4)}, {lng.toFixed(4)}
          </Text>
        )}

        <Text style={styles.radiusLabel}>Service Radius</Text>
        <View style={styles.radiusGrid}>
          {RADIUS_OPTIONS.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.radiusChip, radius === r && styles.radiusChipActive]}
              onPress={() => setRadius(r)}
              activeOpacity={0.7}
            >
              <Text style={[styles.radiusChipText, radius === r && styles.radiusChipTextActive]}>
                {r} km
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.radiusHint}>
          You will receive job requests within {radius} km of your location.
        </Text>
      </View>

      <View style={styles.footer}>
        <Button title="Next" onPress={handleNext} disabled={!city.trim() || !province.trim()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  progress: { flexDirection: 'row', flex: 1, justifyContent: 'center', gap: spacing.xs },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  progressDone: { backgroundColor: colors.success },
  progressActive: { backgroundColor: colors.primary, width: 24 },
  step: { ...typography.caption, color: colors.textTertiary, marginLeft: spacing.sm },
  body: {
    flex: 1,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    gap: spacing.xs,
  },
  title: { ...typography.h2, color: colors.text },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.sm },
  cityPickerLabel: { ...typography.body, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  cityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  cityChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  cityChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  cityChipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  cityChipTextActive: { color: colors.primary },
  radiusLabel: { ...typography.body, fontWeight: '600', color: colors.text, marginTop: spacing.sm },
  radiusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  radiusChip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  radiusChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  radiusChipText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  radiusChipTextActive: { color: colors.primary },
  radiusHint: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  locateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    marginTop: spacing.sm,
    minHeight: 48,
  },
  locateBtnText: { ...typography.body, color: colors.primary, fontWeight: '700' },
  locateHint: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs },
  footer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
