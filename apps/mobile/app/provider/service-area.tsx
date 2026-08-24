import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import MapView, { Marker, Circle as MapCircle, PROVIDER_DEFAULT } from 'react-native-maps';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getErrorMessage } from '@/utils/errors';
import { showToast } from '@/lib/toast';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { FALLBACK_REGION } from '@/hooks/useServiceAreaDefaults';
import { MapPin } from '@/components/icons';
import ConfirmModal from '@/components/ConfirmModal';
import {
  cancelProviderServiceAreaChange,
  getActiveServiceAreas,
  getProviderServiceAreaState,
  requestProviderServiceAreaChange,
  type ServiceArea,
} from '@/services/service-area.service';

const BASE_RADIUS_OPTIONS = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100];

function radiusOptions(maxRadiusKm: number, currentRadiusKm: number): number[] {
  return Array.from(new Set([
    ...BASE_RADIUS_OPTIONS.filter((value) => value <= maxRadiusKm),
    maxRadiusKm,
    Math.min(currentRadiusKm, maxRadiusKm),
  ]))
    .filter((value) => value >= 1)
    .sort((a, b) => a - b);
}

function formatSubmittedAt(value: string): string {
  return new Date(value).toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  });
}

export default function ProviderServiceAreaScreen(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(15);
  const [pinLat, setPinLat] = useState<number | null>(null);
  const [pinLng, setPinLng] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [locating, setLocating] = useState(false);
  const [showWithdrawConfirmation, setShowWithdrawConfirmation] = useState(false);

  const stateQuery = useQuery({
    queryKey: ['providerServiceAreaState'],
    queryFn: getProviderServiceAreaState,
  });
  const areasQuery = useQuery({
    queryKey: ['activeServiceAreas'],
    queryFn: getActiveServiceAreas,
  });

  const state = stateQuery.data;
  const areas = areasQuery.data ?? [];
  const latest = state?.latestChange ?? null;
  const isPending = latest?.status === 'pending';
  const selectedArea = areas.find((area) => area.id === selectedAreaId) ?? null;

  useEffect(() => {
    if (!state || selectedAreaId !== null) return;
    const initialAreaId = state.currentArea?.id ?? areas[0]?.id ?? null;
    setSelectedAreaId(initialAreaId);
    setRadiusKm(Math.min(state.currentRadiusKm || 15, state.maxRadiusKm));
    setPinLat(state.currentLatitude);
    setPinLng(state.currentLongitude);
  }, [areas, selectedAreaId, state]);

  const availableRadii = useMemo(
    () => radiusOptions(state?.maxRadiusKm ?? 50, state?.currentRadiusKm ?? 15),
    [state?.currentRadiusKm, state?.maxRadiusKm],
  );

  const selectArea = (area: ServiceArea): void => {
    setSelectedAreaId(area.id);
    if (area.id === state?.currentArea?.id) {
      setPinLat(state.currentLatitude);
      setPinLng(state.currentLongitude);
    } else {
      // A different market needs a fresh provider-controlled pin. The area
      // center is used only to frame the map; it is never submitted as the
      // provider's location.
      setPinLat(null);
      setPinLng(null);
    }
  };

  const useCurrentLocation = async (): Promise<void> => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location permission needed', 'Allow location access so your service-area request contains an accurate location pin.');
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setPinLat(location.coords.latitude);
      setPinLng(location.coords.longitude);
    } catch {
      Alert.alert('Location unavailable', 'We could not capture your current location. Check location services and try again.');
    } finally {
      setLocating(false);
    }
  };

  const requestMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAreaId) throw new Error('Choose a service area.');
      if (pinLat == null || pinLng == null) {
        throw new Error('Use your current location before submitting this request.');
      }
      if (reason.trim().length < 10) {
        throw new Error('Tell the review team why you need this change (at least 10 characters).');
      }
      return requestProviderServiceAreaChange({
        areaId: selectedAreaId,
        radiusKm,
        latitude: pinLat,
        longitude: pinLng,
        reason: reason.trim(),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['providerServiceAreaState'] });
      setReason('');
      showToast('Your change request was sent for admin review.', 'success');
    },
    onError: (error: unknown) => {
      showToast(getErrorMessage(error, 'Could not submit the service-area request.'), 'error');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelProviderServiceAreaChange,
    onSuccess: () => {
      setShowWithdrawConfirmation(false);
      void queryClient.invalidateQueries({ queryKey: ['providerServiceAreaState'] });
      showToast('Your pending service-area request was withdrawn.', 'success');
    },
    onError: (error: unknown) => {
      showToast(getErrorMessage(error, 'Could not withdraw the pending request.'), 'error');
    },
  });

  const mapCenter = {
    latitude: pinLat ?? selectedArea?.centerLat ?? state?.currentArea?.centerLat ?? FALLBACK_REGION.latitude,
    longitude: pinLng ?? selectedArea?.centerLng ?? state?.currentArea?.centerLng ?? FALLBACK_REGION.longitude,
  };

  if ((stateQuery.isLoading || areasQuery.isLoading) && !state) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>Loading service area…</Text>
      </SafeAreaView>
    );
  }

  if (stateQuery.isError || areasQuery.isError || !state) {
    return (
      <SafeAreaView style={styles.loading}>
        <Text style={styles.errorTitle}>Service area unavailable</Text>
        <Text style={styles.errorText}>We could not load your current coverage or the available markets.</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => { void Promise.all([stateQuery.refetch(), areasQuery.refetch()]); }}
        >
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Service Area</Text>
          <Text style={styles.headerSubtitle}>Changes are reviewed before they affect job matching.</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.pageWidth}>
          {isPending && latest && (
            <View style={[styles.notice, styles.noticePending]}>
              <Text style={styles.noticeTitle}>Pending admin review</Text>
              <Text style={styles.noticeText}>
                {latest.requestedAreaName ?? latest.requestedCity ?? 'Requested area'} · {latest.requestedRadiusKm} km
              </Text>
              <Text style={styles.noticeMeta}>Submitted {formatSubmittedAt(latest.createdAt)}. Your current coverage remains active until approval.</Text>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.withdrawButton}
                onPress={() => setShowWithdrawConfirmation(true)}
              >
                <Text style={styles.withdrawButtonText}>Withdraw request</Text>
              </TouchableOpacity>
            </View>
          )}
          {latest?.status === 'rejected' && (
            <View style={[styles.notice, styles.noticeRejected]}>
              <Text style={styles.noticeTitle}>Previous request was not approved</Text>
              <Text style={styles.noticeText}>{latest.decisionReason || 'Open a support case if you need more detail.'}</Text>
              <Text style={styles.noticeMeta}>Correct the area, pin, or radius below and submit a new request.</Text>
            </View>
          )}

          <View style={styles.currentCard}>
            <View>
              <Text style={styles.eyebrow}>Current approved coverage</Text>
              <Text style={styles.currentTitle}>{state.currentArea?.name ?? 'No primary area assigned'}</Text>
              <Text style={styles.currentMeta}>
                {state.currentArea ? `${state.currentArea.city}, ${state.currentArea.province} · ` : ''}{state.currentRadiusKm} km radius
              </Text>
            </View>
            <View style={styles.limitPill}>
              <Text style={styles.limitPillText}>Platform max {state.maxRadiusKm} km</Text>
            </View>
          </View>

          <View
            style={[styles.workspace, isWide && styles.workspaceWide]}
            accessibilityLabel={isWide ? 'Tablet and desktop provider service area workspace' : undefined}
          >
            <View style={[styles.mapColumn, isWide && styles.mapColumnWide]}>
              <View style={styles.mapWrap}>
                <MapView
                  provider={PROVIDER_DEFAULT}
                  style={styles.map}
                  region={{
                    ...mapCenter,
                    latitudeDelta: Math.max(0.05, radiusKm / 50),
                    longitudeDelta: Math.max(0.05, radiusKm / 50),
                  }}
                  pointerEvents="none"
                >
                  {pinLat != null && pinLng != null && (
                    <>
                      <Marker coordinate={{ latitude: pinLat, longitude: pinLng }} />
                      <MapCircle
                        center={{ latitude: pinLat, longitude: pinLng }}
                        radius={radiusKm * 1000}
                        strokeColor={colors.primary}
                        fillColor="rgba(0,61,155,0.12)"
                        strokeWidth={2}
                      />
                    </>
                  )}
                </MapView>
                {pinLat == null && (
                  <View style={styles.mapPrompt}>
                    <MapPin size={22} color={colors.primary} />
                    <Text style={styles.mapPromptText}>Capture your location to place the reviewed pin.</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity
                style={styles.locationButton}
                onPress={() => { void useCurrentLocation(); }}
                disabled={locating || isPending}
              >
                {locating ? <ActivityIndicator size="small" color={colors.primary} /> : <MapPin size={17} color={colors.primary} />}
                <Text style={styles.locationButtonText}>{locating ? 'Locating…' : 'Use My Current Location'}</Text>
              </TouchableOpacity>
              <Text style={styles.pinText}>
                {pinLat != null && pinLng != null
                  ? `Review pin: ${pinLat.toFixed(4)}, ${pinLng.toFixed(4)}`
                  : 'No review pin captured yet.'}
              </Text>
            </View>

            <View style={[styles.formColumn, isWide && styles.formColumnWide]}>
              <Text style={styles.sectionTitle}>1. Choose a market</Text>
              <View style={styles.areaGrid}>
                {areas.map((area) => {
                  const active = selectedAreaId === area.id;
                  return (
                    <TouchableOpacity
                      key={area.id}
                      style={[styles.areaCard, active && styles.areaCardActive]}
                      onPress={() => selectArea(area)}
                      disabled={isPending}
                    >
                      <Text style={[styles.areaName, active && styles.areaNameActive]}>{area.name}</Text>
                      <Text style={[styles.areaLocation, active && styles.areaLocationActive]}>{area.city}, {area.province}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionTitle}>2. Set travel radius</Text>
              <View style={styles.radiusGrid}>
                {availableRadii.map((value) => {
                  const active = radiusKm === value;
                  return (
                    <TouchableOpacity
                      key={value}
                      style={[styles.radiusButton, active && styles.radiusButtonActive]}
                      onPress={() => setRadiusKm(value)}
                      disabled={isPending}
                    >
                      <Text style={[styles.radiusText, active && styles.radiusTextActive]}>{value} km</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionTitle}>3. Add context for the reviewer</Text>
              <TextInput
                accessibilityLabel="Reason for service area change"
                value={reason}
                onChangeText={setReason}
                editable={!isPending}
                multiline
                maxLength={500}
                placeholder="Tell the operations team why this area, pin, or radius is changing."
                placeholderTextColor={colors.textTertiary}
                style={styles.reasonInput}
              />
              <Text style={styles.characterCount}>{reason.trim().length}/500 · minimum 10</Text>

              <TouchableOpacity
                style={[styles.submitButton, (isPending || requestMutation.isPending || reason.trim().length < 10) && styles.submitButtonDisabled]}
                onPress={() => requestMutation.mutate()}
                disabled={isPending || requestMutation.isPending || reason.trim().length < 10}
              >
                {requestMutation.isPending
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={styles.submitText}>{isPending ? 'Review pending' : 'Submit for review'}</Text>}
              </TouchableOpacity>
              <Text style={styles.reviewNote}>An admin checks the market, location pin, and radius before matching changes.</Text>
            </View>
          </View>
        </View>
      </ScrollView>
      <ConfirmModal
        visible={showWithdrawConfirmation}
        title="Withdraw service-area request?"
        message="Your approved coverage will stay unchanged. You can submit a corrected request after this one is withdrawn."
        confirmLabel="Withdraw request"
        cancelLabel="Keep waiting"
        loading={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutate()}
        onCancel={() => setShowWithdrawConfirmation(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.surfaceMuted },
  loadingText: { ...typography.body, color: colors.textSecondary },
  errorTitle: { ...typography.h2, color: colors.text, textAlign: 'center' },
  errorText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', maxWidth: 420 },
  retryButton: { backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: borderRadius.lg },
  retryText: { ...typography.button, color: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  backButton: { width: 48, minHeight: 48, justifyContent: 'center' },
  backText: { fontSize: 24, color: colors.text },
  headerCopy: { flex: 1, alignItems: 'center' },
  headerTitle: { ...typography.h3, color: colors.text },
  headerSubtitle: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginTop: 2 },
  headerSpacer: { width: 48 },
  scrollContent: { padding: spacing.base, paddingBottom: spacing.xxl },
  pageWidth: { width: '100%', maxWidth: 1180, alignSelf: 'center', gap: spacing.md },
  notice: { borderRadius: borderRadius.lg, borderWidth: 1, padding: spacing.base },
  noticePending: { backgroundColor: colors.warningLight, borderColor: colors.warning },
  noticeRejected: { backgroundColor: colors.errorLight, borderColor: colors.error },
  noticeTitle: { ...typography.body, color: colors.text, fontWeight: '800' },
  noticeText: { ...typography.bodySmall, color: colors.text, marginTop: spacing.xs },
  noticeMeta: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  withdrawButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginTop: spacing.sm },
  withdrawButtonText: { ...typography.bodySmall, color: colors.primary, fontWeight: '700' },
  currentCard: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, borderRadius: borderRadius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.lg },
  eyebrow: { ...typography.caption, color: colors.primary, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  currentTitle: { ...typography.h2, color: colors.text, marginTop: spacing.xs },
  currentMeta: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  limitPill: { backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  limitPillText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  workspace: { gap: spacing.md },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start' },
  mapColumn: { borderRadius: borderRadius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md },
  mapColumnWide: { flex: 1.05, minWidth: 0 },
  formColumn: { borderRadius: borderRadius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.lg },
  formColumnWide: { flex: 0.95, minWidth: 0 },
  mapWrap: { height: 340, borderRadius: borderRadius.lg, overflow: 'hidden', backgroundColor: colors.backgroundSecondary },
  map: { flex: 1 },
  mapPrompt: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl, backgroundColor: 'rgba(255,255,255,0.86)' },
  mapPromptText: { ...typography.bodySmall, color: colors.text, textAlign: 'center', maxWidth: 260 },
  locationButton: { minHeight: 48, marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1.5, borderColor: colors.primary, borderRadius: borderRadius.lg, backgroundColor: colors.primaryLight },
  locationButtonText: { ...typography.bodySmall, color: colors.primary, fontWeight: '700' },
  pinText: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  sectionTitle: { ...typography.body, color: colors.text, fontWeight: '800', marginBottom: spacing.sm, marginTop: spacing.sm },
  areaGrid: { gap: spacing.sm, marginBottom: spacing.md },
  areaCard: { borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, padding: spacing.md, backgroundColor: colors.surfaceMuted },
  areaCardActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  areaName: { ...typography.bodySmall, color: colors.text, fontWeight: '700' },
  areaNameActive: { color: colors.primary },
  areaLocation: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  areaLocationActive: { color: colors.primary },
  radiusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  radiusButton: { minWidth: 64, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, backgroundColor: colors.surfaceMuted },
  radiusButtonActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  radiusText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '700' },
  radiusTextActive: { color: colors.white },
  reasonInput: { minHeight: 104, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, padding: spacing.md, color: colors.text, backgroundColor: colors.surfaceMuted, textAlignVertical: 'top', ...typography.bodySmall },
  characterCount: { ...typography.caption, color: colors.textTertiary, textAlign: 'right', marginTop: spacing.xs },
  submitButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: borderRadius.lg, backgroundColor: colors.primary, marginTop: spacing.md },
  submitButtonDisabled: { opacity: 0.55 },
  submitText: { ...typography.button, color: colors.white },
  reviewNote: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
});
