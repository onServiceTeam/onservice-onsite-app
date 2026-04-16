import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { Button, Input } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

const RADIUS_OPTIONS = [5, 10, 15, 20, 30, 50];

const PH_REGIONS: { city: string; province: string; lat: number; lng: number }[] = [
  { city: 'Quezon City', province: 'Metro Manila', lat: 14.6760, lng: 121.0437 },
  { city: 'Manila', province: 'Metro Manila', lat: 14.5995, lng: 120.9842 },
  { city: 'Makati', province: 'Metro Manila', lat: 14.5547, lng: 121.0244 },
  { city: 'Cebu City', province: 'Cebu', lat: 10.3157, lng: 123.8854 },
  { city: 'Davao City', province: 'Davao del Sur', lat: 7.1907, lng: 125.4553 },
  { city: 'Pasig', province: 'Metro Manila', lat: 14.5764, lng: 121.0851 },
  { city: 'Taguig', province: 'Metro Manila', lat: 14.5176, lng: 121.0509 },
  { city: 'Parañaque', province: 'Metro Manila', lat: 14.4793, lng: 121.0198 },
  { city: 'Caloocan', province: 'Metro Manila', lat: 14.6570, lng: 120.9790 },
  { city: 'Iloilo City', province: 'Iloilo', lat: 10.7202, lng: 122.5621 },
];

export default function ServiceAreaScreen(): React.ReactElement {
  const router = useRouter();
  const store = useOnboardingStore();
  const [radius, setRadius] = useState(store.serviceRadiusKm);
  const [city, setCity] = useState(store.city);
  const [province, setProvince] = useState(store.province);
  const [lat, setLat] = useState<number | null>(store.latitude);
  const [lng, setLng] = useState<number | null>(store.longitude);

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
        finalLat = 14.5995;
        finalLng = 120.9842;
      }
    }

    store.setServiceArea({
      radiusKm: radius,
      lat: finalLat,
      lng: finalLng,
      city: city.trim(),
      province: province.trim(),
    });
    router.push('/provider-onboarding/documents');
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

        <Input label="City" placeholder="e.g. Quezon City" value={city} onChangeText={(v) => { setCity(v); setLat(null); setLng(null); }} />
        <Input label="Province" placeholder="e.g. Metro Manila" value={province} onChangeText={setProvince} />

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
  backBtn: { padding: spacing.xs, marginRight: spacing.sm },
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
  footer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
