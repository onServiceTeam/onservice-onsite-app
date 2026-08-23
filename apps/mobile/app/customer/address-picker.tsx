import React, { useState, useRef, useCallback, useEffect } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, Alert, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { useQuery } from '@tanstack/react-query';
import { useBookingStore } from '@/stores/booking.store';
import { useLocation } from '@/hooks/useLocation';
import { Button } from '@/components/ui';
import * as addressService from '@/services/address.service';
import type { SavedAddress } from '@/services/address.service';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { useServiceAreaDefaults } from '@/hooks/useServiceAreaDefaults';
import { checkCoverage } from '@/services/service-area.service';
import { findNearestConfiguredArea, matchConfiguredAreasForQuery } from '@/utils/ph-regions';
import type { ComponentType } from 'react';
import { Home as HomeIcon, Building2, Pin, MapPin } from '@/components/icons';

type IconProps = { size?: number; color?: string };
type IconComponent = ComponentType<IconProps>;

// Multi-city — the map opens on the admin-configured default service area
// (see useServiceAreaDefaults). No hardcoded city here; FALLBACK_REGION in the
// hook is the offline floor.

interface GeoResult {
  address: string;
  barangay: string;
  city: string;
  province: string;
  latitude: number;
  longitude: number;
}

const LABEL_ICONS: Record<string, IconComponent> = { Home: HomeIcon, Work: Building2, Other: Pin };

export default function AddressPickerScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setAddress = useBookingStore((s) => s.setAddress);
  const mapRef = useRef<MapView>(null);
  const { isAvailable: gpsAvailable, isLoading: gpsLoading, getCurrentLocation } = useLocation();
  const { areas, defaultRegion, isLoading: areasLoading } = useServiceAreaDefaults();
  const recenteredOnDefault = useRef(false);

  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [searchText, setSearchText] = useState('');
  const [selectedAddress, setSelectedAddress] = useState<GeoResult | null>(null);
  const [searchResults, setSearchResults] = useState<GeoResult[]>([]);
  const [searchMessage, setSearchMessage] = useState('');
  const [barangayText, setBarangayText] = useState('');
  const [hasExactCoordinates, setHasExactCoordinates] = useState(false);
  const [checkingCoverage, setCheckingCoverage] = useState(false);

  const { data: savedAddresses } = useQuery({
    queryKey: ['saved-addresses'],
    queryFn: addressService.getAddresses,
    staleTime: 60 * 1000,
  });

  // Once the configured default area loads, recenter the map there — but only
  // if the user hasn't already dropped a pin or picked an address, and only
  // once, so we never fight a user gesture.
  useEffect(() => {
    if (recenteredOnDefault.current) return;
    if (pin || selectedAddress) return;
    recenteredOnDefault.current = true;
    mapRef.current?.animateToRegion(defaultRegion, 350);
  }, [defaultRegion, pin, selectedAddress]);

  const handleSelectSaved = useCallback((addr: SavedAddress) => {
    setBarangayText(addr.barangay);
    if (addr.latitude == null || addr.longitude == null) {
      // UX-051 — never substitute Cebu's center for a saved address that has
      // no coordinates. That sent providers to the wrong city. Keep the real
      // text visible and ask the customer to capture an exact location.
      setSearchText([addr.fullAddress, addr.barangay, addr.city, addr.province].filter(Boolean).join(', '));
      setSelectedAddress(null);
      setPin(null);
      setHasExactCoordinates(false);
      setSearchMessage('This saved address needs an exact location. Use your current location or set the pin in the mobile app before booking.');
      return;
    }
    const geo: GeoResult = {
      address: addr.fullAddress,
      barangay: addr.barangay,
      city: addr.city,
      province: addr.province,
      latitude: addr.latitude,
      longitude: addr.longitude,
    };
    setSelectedAddress(geo);
    const coords = { latitude: geo.latitude, longitude: geo.longitude };
    setPin(coords);
    setHasExactCoordinates(true);
    setSearchMessage('');
    setSearchResults([]);
    mapRef.current?.animateToRegion({
      ...coords,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
  }, []);

  const handleUseMyLocation = useCallback(async () => {
    const coords = await getCurrentLocation();
    if (!coords) return;

    if (coords.latitude < 4.5 || coords.latitude > 21.5 || coords.longitude < 116 || coords.longitude > 127.5) {
      Alert.alert('Location Error', 'Your current location appears to be outside the Philippines.');
      return;
    }

    setPin(coords);
    const nearestArea = findNearestConfiguredArea(coords.latitude, coords.longitude, areas);
    setSelectedAddress({
      address: searchText.trim() || `Current Location: ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`,
      barangay: barangayText.trim(),
      city: nearestArea?.city ?? '',
      province: nearestArea?.province ?? '',
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
    setSearchResults([]);
    setHasExactCoordinates(true);
    setSearchMessage('');
    mapRef.current?.animateToRegion({
      ...coords,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
  }, [areas, barangayText, getCurrentLocation, searchText]);

  const handleMapPress = useCallback((e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    if (latitude < 4.5 || latitude > 21.5 || longitude < 116 || longitude > 127.5) {
      Alert.alert('Invalid Location', 'Please select a location within the Philippines.');
      return;
    }
    setPin({ latitude, longitude });

    const nearestArea = findNearestConfiguredArea(latitude, longitude, areas);
    setSelectedAddress({
      address: searchText.trim() || `Pin: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
      barangay: barangayText.trim(),
      city: nearestArea?.city ?? '',
      province: nearestArea?.province ?? '',
      latitude,
      longitude,
    });
    setSearchResults([]);
    setHasExactCoordinates(true);
    setSearchMessage('');
  }, [areas, barangayText, searchText]);

  const handleSearch = useCallback(() => {
    if (!searchText.trim()) return;
    if (areasLoading) {
      setSearchMessage('Loading active service areas. Please try again in a moment.');
      return;
    }
    const matches = matchConfiguredAreasForQuery(searchText, areas);
    if (matches.length > 0) {
      setSearchMessage('');
      setSearchResults(matches.map((match) => ({
        address: searchText.trim(),
        barangay: '',
        city: match.city,
        province: match.province,
        latitude: match.centerLat,
        longitude: match.centerLng,
      })));
    } else {
      // No known city in the typed text. Don't fabricate an empty-city result
      // that blocks Confirm two taps later with "Location Not Recognized" —
      // tell the user how to succeed now.
      setSearchResults([]);
      setSearchMessage(
        `We could not match that address to an active service area. Try including one of: ${areas.map((area) => area.city).join(', ') || 'an active city'}.`,
      );
    }
  }, [areas, areasLoading, searchText]);

  const handleSelectResult = (result: GeoResult): void => {
    // A city-center search result is only a map starting point. It is not an
    // exact service coordinate and cannot be confirmed until the customer
    // drops a pin or uses device location.
    setPin(null);
    setSelectedAddress(result);
    setBarangayText('');
    setHasExactCoordinates(false);
    setSearchResults([]);
    setSearchMessage('');
    mapRef.current?.animateToRegion({
      ...result,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
  };

  const handleConfirm = async (): Promise<void> => {
    if (!selectedAddress) {
      Alert.alert('Select Address', 'Please tap on the map or search for your address.');
      return;
    }
    if (!selectedAddress.city) {
      Alert.alert(
        'Location Not Recognized',
        'We could not determine the city for this pin. Please use the search bar to find your address.',
      );
      return;
    }
    if (!hasExactCoordinates) {
      Alert.alert('Exact Location Required', 'Use your current location or set the map pin at the service address before confirming.');
      return;
    }
    if (!barangayText.trim()) {
      Alert.alert('Barangay Required', 'Enter the barangay for the service address.');
      return;
    }

    setCheckingCoverage(true);
    try {
      const coverage = await checkCoverage(selectedAddress.latitude, selectedAddress.longitude);
      if (!coverage.covered || !coverage.area) {
        Alert.alert(
          'Outside Service Area',
          coverage.nearestArea
            ? `This location is outside our active coverage. The nearest area is ${coverage.nearestArea.name}.`
            : 'This location is outside our active coverage.',
        );
        return;
      }
      setAddress({
        ...selectedAddress,
        barangay: barangayText.trim(),
        city: coverage.area.city,
        province: coverage.area.province,
      });
      router.back();
    } catch {
      Alert.alert('Coverage Check Failed', 'We could not verify this location. Please check your connection and try again.');
    } finally {
      setCheckingCoverage(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Select Address</Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <TextInput
          style={styles.searchInput}
          placeholder="Search for an address..."
          placeholderTextColor={colors.textTertiary}
          value={searchText}
          onChangeText={(t) => { setSearchText(t); if (searchMessage) setSearchMessage(''); }}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          accessibilityLabel="Service address"
        />
          <TouchableOpacity
            style={styles.searchButton}
            onPress={handleSearch}
            accessibilityRole="button"
            accessibilityLabel="Search active service areas"
          >
            <Text style={styles.searchButtonText}>Search</Text>
          </TouchableOpacity>
        </View>
      </View>

      {searchResults.length > 0 && (
        <FlatList
          data={searchResults}
          keyExtractor={(_, i) => i.toString()}
          style={styles.resultsList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.resultItem}
              onPress={() => handleSelectResult(item)}
            >
              <MapPin size={16} color={colors.textTertiary} style={styles.resultIcon} />
              <View style={styles.resultText}>
                <Text style={styles.resultAddress}>{item.address}</Text>
                <Text style={styles.resultArea}>
                  {[item.barangay, item.city, item.province].filter(Boolean).join(', ')}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {searchMessage.length > 0 && searchResults.length === 0 && (
        <View style={styles.searchMessageBox}>
          <Text style={styles.searchMessageText}>{searchMessage}</Text>
        </View>
      )}

      {savedAddresses && savedAddresses.length > 0 && searchResults.length === 0 && (
        <View style={styles.savedSection}>
          <Text style={styles.savedLabel}>Saved Addresses</Text>
          {savedAddresses.map((addr) => {
            const SavedIcon = LABEL_ICONS[addr.label] ?? Pin;
            return (
            <TouchableOpacity
              key={addr.id}
              style={styles.savedItem}
              onPress={() => handleSelectSaved(addr)}
            >
              <View style={styles.savedIconWrap}>
                <SavedIcon size={20} color={colors.primary} />
              </View>
              <View style={styles.savedText}>
                <Text style={styles.savedAddrLabel}>{addr.label}</Text>
                <Text style={styles.savedAddr} numberOfLines={1}>
                  {[addr.fullAddress, addr.barangay, addr.city].filter(Boolean).join(', ')}
                </Text>
              </View>
              {addr.isDefault && (
                <View style={styles.defaultTag}>
                  <Text style={styles.defaultTagText}>Default</Text>
                </View>
              )}
            </TouchableOpacity>
            );
          })}
        </View>
      )}

      {gpsAvailable && (
        <TouchableOpacity
          style={styles.myLocationButton}
          onPress={() => void handleUseMyLocation()}
          disabled={gpsLoading}
          activeOpacity={0.7}
        >
          {gpsLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <MapPin size={16} color={colors.primary} style={styles.myLocationIcon} />
          )}
          <Text style={styles.myLocationText}>
            {gpsLoading ? 'Getting location...' : 'Use My Location'}
          </Text>
        </TouchableOpacity>
      )}

      {Platform.OS === 'web' && (
        <View style={styles.browserNotice}>
          <Text style={styles.browserNoticeTitle}>Booking in a browser</Text>
          <Text style={styles.browserNoticeText}>
            Search for the address, enter its barangay, then use this device&apos;s location while you are at the service property. For another property, set the exact pin in the mobile app.
          </Text>
        </View>
      )}

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={defaultRegion}
        onPress={handleMapPress}
      >
        {pin && <Marker coordinate={pin} />}
      </MapView>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.base }]}>
        {selectedAddress && (
          <>
            <View style={styles.selectedRow}>
              <MapPin size={16} color={colors.text} style={{ marginRight: 6, marginTop: 2 }} />
              <Text style={styles.selectedText} numberOfLines={2}>
                {[selectedAddress.address, barangayText, selectedAddress.city].filter(Boolean).join(', ')}
              </Text>
            </View>
            <TextInput
              style={styles.barangayInput}
              placeholder="Barangay *"
              placeholderTextColor={colors.textTertiary}
              value={barangayText}
              onChangeText={setBarangayText}
              maxLength={100}
              accessibilityLabel="Barangay"
            />
            {!hasExactCoordinates && (
              <Text style={styles.precisionWarning} accessibilityRole="alert">
                City found. Now use your current location or move the map pin to the exact service address.
              </Text>
            )}
          </>
        )}
        <Button
          title="Confirm Address"
          onPress={() => void handleConfirm()}
          loading={checkingCoverage}
          disabled={!selectedAddress || !hasExactCoordinates || !barangayText.trim() || checkingCoverage}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  backButton: { padding: spacing.sm, marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' as const },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text },
  myLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    zIndex: 10,
  },
  myLocationIcon: { marginRight: spacing.xs },
  myLocationText: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },
  searchContainer: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  searchRow: { flexDirection: 'row', gap: spacing.sm },
  searchInput: {
    ...typography.body,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    color: colors.text,
    flex: 1,
  },
  searchButton: {
    minWidth: 88,
    minHeight: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  searchButtonText: { ...typography.button, color: colors.white },
  searchMessageBox: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.md,
    zIndex: 10,
  },
  searchMessageText: {
    ...typography.bodySmall,
    color: colors.warningDark,
  },
  resultsList: {
    position: 'absolute',
    top: 140,
    left: spacing.base,
    right: spacing.base,
    maxHeight: 200,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    zIndex: 20,
    elevation: 5,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  resultItem: {
    flexDirection: 'row',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  resultIcon: { marginRight: spacing.sm, marginTop: 2 },
  resultText: { flex: 1 },
  resultAddress: { ...typography.body, color: colors.text },
  resultArea: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  savedSection: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  savedLabel: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  savedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  savedIcon: { fontSize: 16 },
  savedIconWrap: { alignItems: 'center' as const, justifyContent: 'center' as const, width: 24 },
  savedText: { flex: 1 },
  savedAddrLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  savedAddr: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  defaultTag: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
  },
  defaultTagText: { ...typography.caption, color: colors.primary, fontWeight: '600', fontSize: 10 },

  map: { flex: 1 },
  browserNotice: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  browserNoticeTitle: { ...typography.bodySmall, color: colors.primary, fontWeight: '700', marginBottom: 2 },
  browserNoticeText: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  bottomBar: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  selectedText: {
    ...typography.bodySmall,
    color: colors.text,
    flex: 1,
  },
  barangayInput: {
    ...typography.body,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  precisionWarning: {
    ...typography.caption,
    color: colors.warningDark,
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
});
