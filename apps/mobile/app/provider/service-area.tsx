import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
// Phase E CRIT-111 fix — POST /providers/me/service-area does not
// exist on the backend (404). Replaced with the canonical PATCH
// /providers/me endpoint, which accepts serviceRadiusKm + latitude +
// longitude (validators/provider.validators.ts updateProfileSchema).
// Field names also renamed: centerLat/centerLng → latitude/longitude
// and radiusKm → serviceRadiusKm to match the schema.
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import MapView, { Marker, Circle as MapCircle, PROVIDER_DEFAULT } from 'react-native-maps';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { getMyProfile } from '@/services/provider-api.service';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { MapPin } from '@/components/icons';

const RADIUS_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50] as const;
// Phase E CRIT-111 fix — default map center is Boracay (the launch
// market), not Quezon City. Same correction landed in the
// onboarding service-area screen via CRIT-116 / K-MED-K06. Provider
// almost always taps "Use My Current Location" anyway, so this only
// matters for the initial map render before geolocation resolves.
const DEFAULT_LAT = 11.9685;
const DEFAULT_LNG = 121.9162;

export default function ProviderServiceAreaScreen(): React.ReactElement {
  const router = useRouter();
  const [centerLat, setCenterLat] = useState<number>(DEFAULT_LAT);
  const [centerLng, setCenterLng] = useState<number>(DEFAULT_LNG);
  const [radiusKm, setRadiusKm] = useState<number>(15);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  // BUG-PHASE55-01 fix — pre-fix the screen loaded with hardcoded
  // DEFAULT_LAT/DEFAULT_LNG/15km regardless of the provider's
  // already-saved values. A provider opening Service Area to
  // adjust their radius would see "15 km" and Boracay coords even
  // if their actual coverage was 25 km in another barangay; an
  // accidental Save would silently overwrite their settings.
  // Now: load current profile values first; defaults only apply
  // when the API returns null (first-time setup).
  const profileQuery = useQuery({
    queryKey: ['providerProfile'],
    queryFn: getMyProfile,
    staleTime: 60 * 1000,
  });
  React.useEffect(() => {
    const profile = profileQuery.data;
    if (!profile) return;
    if (profile.latitude != null) setCenterLat(profile.latitude);
    if (profile.longitude != null) setCenterLng(profile.longitude);
    if (profile.serviceRadiusKm != null) setRadiusKm(profile.serviceRadiusKm);
  }, [profileQuery.data]);

  const useCurrentLocation = async (): Promise<void> => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission denied', 'Please allow location access to use your current position.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setCenterLat(loc.coords.latitude);
      setCenterLng(loc.coords.longitude);
    } catch {
      Alert.alert('Location unavailable', 'Could not get your current location in this build.');
    } finally {
      setLocating(false);
    }
  };

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      // Phase E CRIT-111 fix — PATCH /providers/me with the canonical
      // field names accepted by updateProfileSchema. The pre-fix POST
      // /me/service-area endpoint never existed; every save returned
      // 404 and was masked by the generic "Save failed" toast.
      await api.patch('/api/v1/providers/me', {
        latitude: centerLat,
        longitude: centerLng,
        serviceRadiusKm: radiusKm,
      });
      Alert.alert('Saved', 'Your service area has been updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      // Phase D CRIT-69 / K-MED-K04 — canonical error helper.
      Alert.alert(
        'Save failed',
        getErrorMessage(err, 'Could not update service area. Please try again.'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Service Area</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <MapPin size={18} color={colors.primary} />
            <Text style={styles.summaryText}>
              {centerLat.toFixed(4)}, {centerLng.toFixed(4)}
            </Text>
          </View>
          <Text style={styles.summarySub}>Service radius · {radiusKm} km</Text>
        </View>

        <TouchableOpacity
          style={styles.locateBtn}
          onPress={() => { void useCurrentLocation(); }}
          disabled={locating}
          activeOpacity={0.7}
        >
          {locating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <MapPin size={16} color={colors.primary} />
              <Text style={styles.locateBtnText}>Use My Current Location</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.mapWrap}>
          <MapView
            provider={PROVIDER_DEFAULT}
            style={styles.map}
            region={{
              latitude: centerLat,
              longitude: centerLng,
              latitudeDelta: Math.max(0.05, radiusKm / 50),
              longitudeDelta: Math.max(0.05, radiusKm / 50),
            }}
            pointerEvents="none"
          >
            <Marker coordinate={{ latitude: centerLat, longitude: centerLng }} />
            <MapCircle
              center={{ latitude: centerLat, longitude: centerLng }}
              radius={radiusKm * 1000}
              strokeColor={colors.primary}
              fillColor="rgba(0,102,255,0.12)"
              strokeWidth={2}
            />
          </MapView>
        </View>

        <Text style={styles.label}>Travel radius</Text>
        <View style={styles.radiusRow}>
          {RADIUS_OPTIONS.map((r) => {
            const active = radiusKm === r;
            return (
              <TouchableOpacity
                key={`r-${r}`}
                style={[styles.radiusDot, active && styles.radiusDotActive]}
                onPress={() => setRadiusKm(r)}
                activeOpacity={0.7}
              >
                <Text style={[styles.radiusDotText, active && styles.radiusDotTextActive]}>
                  {r}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>
          You will receive job requests within {radiusKm} km of the selected center.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]}
          onPress={() => { void handleSave(); }}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.primaryBtnText}>Save</Text>
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
  backBtn: { padding: spacing.xs, minWidth: 44, minHeight: 44, justifyContent: 'center' },
  backText: { fontSize: 22, color: colors.text },
  headerTitle: { ...typography.h3, color: colors.text },
  placeholder: { width: 44 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: spacing.xl },
  summaryCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  summaryText: { ...typography.body, color: colors.text, fontWeight: '600' },
  summarySub: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  locateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    marginBottom: spacing.md,
  },
  locateBtnText: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },
  mapWrap: {
    height: 220,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: colors.backgroundSecondary,
    marginBottom: spacing.md,
  },
  map: { flex: 1 },
  label: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
  },
  radiusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  radiusDot: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radiusDotActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  radiusDotText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  radiusDotTextActive: { color: colors.white },
  hint: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
  footer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.base,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { ...typography.button, color: colors.white },
});
