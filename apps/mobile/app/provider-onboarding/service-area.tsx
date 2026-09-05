import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { ProviderApplicationDraftActions } from '@/components/ProviderApplicationDraftActions';
import { applicationFieldsFromStore } from '@/services/provider-application-draft.service';
import { useApplicationOperation } from '@/hooks/useApplicationOperation';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { AlertTriangle, MapPin } from '@/components/icons';
import { getConfig } from '@/services/config.service';
import { getProviderApplicationAreas, type ServiceArea } from '@/services/service-area.service';

import { Routes } from '@/config/navigation';
const BASE_RADIUS_OPTIONS = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100];

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (degrees: number): number => degrees * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function marketStatusLabel(status: ServiceArea['status']): string {
  if (status === 'active') return 'Active market';
  if (status === 'soft_launch') return 'Soft launch';
  return 'Recruiting providers';
}

export default function ServiceAreaScreen(): React.ReactElement {
  const router = useRouter();
  const store = useOnboardingStore();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const maxServiceRadiusKm = Number(getConfig().maxServiceRadius) || 50;
  const radiusOptions = Array.from(new Set([
    ...BASE_RADIUS_OPTIONS.filter((value) => value <= maxServiceRadiusKm),
    maxServiceRadiusKm,
  ])).sort((a, b) => a - b);
  const areasQuery = useQuery({
    queryKey: ['provider-application-areas'],
    queryFn: getProviderApplicationAreas,
    staleTime: 5 * 60 * 1000,
  });
  const areas = areasQuery.data ?? [];
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(store.serviceAreaId);
  const [radius, setRadius] = useState(Math.min(store.serviceRadiusKm, maxServiceRadiusKm));
  const [lat, setLat] = useState<number | null>(store.latitude);
  const [lng, setLng] = useState<number | null>(store.longitude);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const selectedArea = areas.find((area) => area.id === selectedAreaId) ?? null;
  const [locating, setLocating] = useState(false);
  const operation = useApplicationOperation(() => setLocating(false));

  const selectArea = (area: ServiceArea): void => {
    operation.cancel();
    setLocating(false);
    if (area.id !== selectedAreaId) {
      setLat(null);
      setLng(null);
    }
    setSelectedAreaId(area.id);
    setNotice({
      tone: 'info',
      text: `Selected ${area.name}. Capture your actual operating location before continuing.`,
    });
  };

  const useCurrentLocation = async (): Promise<void> => {
    if (locating) return;
    if (!selectedArea) {
      setNotice({ tone: 'error', text: 'Select the provider market you want to serve first.' });
      return;
    }
    const isCurrent = operation.begin();
    if (!isCurrent) return;
    setLocating(true);
    setNotice(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!isCurrent()) return;
      if (perm.status !== 'granted') {
        setNotice({
          tone: 'error',
          text: 'Location permission is required because matching uses your real operating base, not a city-center estimate.',
        });
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!isCurrent()) return;
      setLat(loc.coords.latitude);
      setLng(loc.coords.longitude);
      const inside = distanceKm(
        loc.coords.latitude,
        loc.coords.longitude,
        selectedArea.centerLat,
        selectedArea.centerLng,
      ) <= selectedArea.radiusKm;
      setNotice(inside
        ? { tone: 'success', text: `Exact operating location captured inside ${selectedArea.name}.` }
        : { tone: 'error', text: `That location is outside ${selectedArea.name}. Select the correct market or recapture from your operating base.` });
    } catch {
      if (!isCurrent()) return;
      setNotice({
        tone: 'error',
        text: 'Could not capture your location. Check browser or device location settings and try again.',
      });
    } finally {
      if (isCurrent()) setLocating(false);
    }
  };

  const validateContinue = (): boolean => {
    if (!selectedArea) {
      setNotice({ tone: 'error', text: 'Select an admin-configured provider market to continue.' });
      return false;
    }
    if (lat == null || lng == null) {
      setNotice({ tone: 'error', text: 'Capture your exact operating location before continuing.' });
      return false;
    }
    if (distanceKm(lat, lng, selectedArea.centerLat, selectedArea.centerLng) > selectedArea.radiusKm) {
      setNotice({
        tone: 'error',
        text: `Your captured base is outside ${selectedArea.name}. Select the correct market or recapture your location.`,
      });
      return false;
    }

    return true;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerShell}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <View style={styles.progress}>
            <View style={[styles.progressDot, styles.progressDone]} />
            <View style={[styles.progressDot, styles.progressActive]} />
            <View style={styles.progressDot} />
            <View style={styles.progressDot} />
            <View style={styles.progressDot} />
            <View style={styles.progressDot} />
          </View>
          <Text style={styles.step}>2 / 6</Text>
        </View>
      </View>

      <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.pageWidth}>
          <Text style={styles.title}>Service Area</Text>
          <Text style={styles.subtitle}>Set the operating location and travel radius that the review team will verify with your application.</Text>

          <View
            style={[styles.workspace, isWide && styles.workspaceWide]}
            accessibilityLabel={isWide ? 'Tablet and desktop provider onboarding service area workspace' : undefined}
          >
            <View style={[styles.panel, isWide && styles.panelWide]}>
              <Text style={styles.panelEyebrow}>Provider market</Text>
              <Text style={styles.cityPickerLabel}>Choose an admin-configured market</Text>
              {areasQuery.isLoading ? (
                <View style={styles.marketState} accessibilityRole="progressbar">
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.marketStateText}>Loading provider markets…</Text>
                </View>
              ) : areasQuery.isError ? (
                <View style={styles.marketState} accessibilityRole="alert">
                  <AlertTriangle size={20} color={colors.error} />
                  <Text style={styles.marketStateText}>Provider markets could not be loaded.</Text>
                  <TouchableOpacity
                    style={styles.retryButton}
                    onPress={() => { void areasQuery.refetch(); }}
                    accessibilityRole="button"
                    accessibilityLabel="Retry provider markets"
                  >
                    <Text style={styles.retryButtonText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : areas.length === 0 ? (
                <View style={styles.marketState} accessibilityRole="alert">
                  <Text style={styles.marketStateText}>No markets are currently open for provider applications.</Text>
                </View>
              ) : (
                <View style={styles.cityGrid} accessibilityRole="radiogroup">
                  {areas.map((area) => {
                    const selected = area.id === selectedAreaId;
                    return (
                      <TouchableOpacity
                        key={area.id}
                        style={[styles.cityChip, selected && styles.cityChipActive]}
                        onPress={() => selectArea(area)}
                        activeOpacity={0.7}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        accessibilityLabel={`${area.name}, ${marketStatusLabel(area.status)}`}
                      >
                        <Text style={[styles.cityChipText, selected && styles.cityChipTextActive]}>
                          {area.name}
                        </Text>
                        <Text style={styles.marketStatus}>{marketStatusLabel(area.status)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <Text style={styles.locationInstruction}>
                Matching uses your actual operating base. A market center is never saved as your location.
              </Text>
              <TouchableOpacity
                style={styles.locateBtn}
                onPress={() => { void useCurrentLocation(); }}
                disabled={locating || !selectedArea}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Capture exact provider operating location"
                accessibilityState={{ disabled: locating || !selectedArea, busy: locating }}
              >
                {locating ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <MapPin size={18} color={colors.primary} style={{ marginRight: spacing.xs }} />
                    <Text style={styles.locateBtnText}>Capture My Operating Location</Text>
                  </>
                )}
              </TouchableOpacity>
              {lat != null && lng != null && (
                <Text style={styles.locateHint}>
                  GPS captured: {lat.toFixed(4)}, {lng.toFixed(4)}
                </Text>
              )}
              {notice && (
                <View
                  style={[
                    styles.notice,
                    notice.tone === 'error' && styles.noticeError,
                    notice.tone === 'success' && styles.noticeSuccess,
                  ]}
                  accessibilityRole={notice.tone === 'error' ? 'alert' : 'summary'}
                >
                  <Text style={styles.noticeText}>{notice.text}</Text>
                </View>
              )}
            </View>

            <View style={[styles.panel, isWide && styles.panelWide]}>
              <Text style={styles.panelEyebrow}>Travel coverage</Text>
              <Text style={styles.radiusLabel}>Service Radius</Text>
              <View style={styles.radiusGrid}>
                {radiusOptions.map((r) => (
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
                You will receive job requests within {radius} km of your verified location. Current platform maximum: {maxServiceRadiusKm} km.
              </Text>
              <View style={styles.reviewNotice}>
                <Text style={styles.reviewNoticeTitle}>Reviewed before approval</Text>
                <Text style={styles.reviewNoticeText}>Operations sees this same market, exact pin, and travel radius in Provider 360 before approval.</Text>
              </View>
            </View>
          </View>
        </View>
      <View style={styles.footer}>
        <View style={styles.footerInner}>
          <ProviderApplicationDraftActions
            fields={{ ...applicationFieldsFromStore(store), serviceAreaId: selectedAreaId,
              serviceRadiusKm: radius, latitude: lat, longitude: lng,
              city: selectedArea?.city ?? store.city, province: selectedArea?.province ?? store.province }}
            validateContinue={validateContinue} disabled={locating}
            onContinue={() => router.push(Routes.PROVIDER_ONBOARDING.VETTING)}
            continueDisabled={!selectedArea || lat == null || lng == null || areasQuery.isError || areasQuery.isLoading}
          />
        </View>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  headerShell: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
  },
  backBtn: { padding: spacing.xs, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backText: { fontSize: 22, color: colors.text },
  progress: { flexDirection: 'row', flex: 1, justifyContent: 'center', gap: spacing.xs },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  progressDone: { backgroundColor: colors.success },
  progressActive: { backgroundColor: colors.primary, width: 24 },
  step: { ...typography.caption, color: colors.textTertiary, marginLeft: spacing.sm },
  bodyScroll: { flex: 1 },
  body: {
    flexGrow: 1,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.lg,
  },
  pageWidth: {
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
  },
  title: { ...typography.h2, color: colors.text },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg },
  workspace: { gap: spacing.md },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start' },
  panel: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
    padding: spacing.base,
    gap: spacing.xs,
  },
  panelWide: { flex: 1 },
  panelEyebrow: { ...typography.caption, color: colors.primary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  cityPickerLabel: { ...typography.body, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  marketState: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  marketStateText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  retryButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.base },
  retryButtonText: { ...typography.button, color: colors.primary },
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
  marketStatus: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  locationInstruction: { ...typography.caption, color: colors.textSecondary, lineHeight: 18, marginTop: spacing.sm },
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
  reviewNotice: { marginTop: spacing.lg, borderRadius: borderRadius.md, backgroundColor: colors.primaryLight, padding: spacing.md },
  reviewNoticeTitle: { ...typography.bodySmall, color: colors.primary, fontWeight: '700' },
  reviewNoticeText: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 18 },
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
  notice: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.info,
    backgroundColor: colors.infoLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  noticeError: { borderColor: colors.error, backgroundColor: colors.errorLight },
  noticeSuccess: { borderColor: colors.success, backgroundColor: colors.successLight },
  noticeText: { ...typography.bodySmall, color: colors.text, lineHeight: 19 },
  footer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerInner: { width: '100%', maxWidth: 1040, alignSelf: 'center' },
});
