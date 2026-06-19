import React, { useState, useRef, useCallback, useEffect } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, Alert, ActivityIndicator } from 'react-native';
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
import { guessRegionFromCoordinates, matchRegionForQuery } from '@/utils/ph-regions';
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
  const { defaultRegion } = useServiceAreaDefaults();
  const recenteredOnDefault = useRef(false);

  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [searchText, setSearchText] = useState('');
  const [selectedAddress, setSelectedAddress] = useState<GeoResult | null>(null);
  const [searchResults, setSearchResults] = useState<GeoResult[]>([]);
  const [searchMessage, setSearchMessage] = useState('');

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
    const geo: GeoResult = {
      address: addr.fullAddress,
      barangay: addr.barangay,
      city: addr.city,
      province: addr.province,
      latitude: addr.latitude ?? 10.3157,
      longitude: addr.longitude ?? 123.8854,
    };
    setSelectedAddress(geo);
    const coords = { latitude: geo.latitude, longitude: geo.longitude };
    setPin(coords);
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
    const regionGuess = guessRegionFromCoordinates(coords.latitude, coords.longitude);
    setSelectedAddress({
      address: `Current Location: ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`,
      barangay: '',
      city: regionGuess.city,
      province: regionGuess.province,
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
    setSearchResults([]);
    mapRef.current?.animateToRegion({
      ...coords,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
  }, [getCurrentLocation]);

  const handleMapPress = useCallback((e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    if (latitude < 4.5 || latitude > 21.5 || longitude < 116 || longitude > 127.5) {
      Alert.alert('Invalid Location', 'Please select a location within the Philippines.');
      return;
    }
    setPin({ latitude, longitude });

    const regionGuess = guessRegionFromCoordinates(latitude, longitude);
    setSelectedAddress({
      address: `Pin: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
      barangay: '',
      city: regionGuess.city,
      province: regionGuess.province,
      latitude,
      longitude,
    });
    setSearchResults([]);
  }, []);

  const handleSearch = useCallback(() => {
    if (!searchText.trim()) return;
    const match = matchRegionForQuery(searchText);
    if (match) {
      setSearchMessage('');
      setSearchResults([{
        address: searchText.trim(),
        barangay: '',
        city: match.city,
        province: match.province,
        latitude: match.lat,
        longitude: match.lng,
      }]);
    } else {
      // No known city in the typed text. Don't fabricate an empty-city result
      // that blocks Confirm two taps later with "Location Not Recognized" —
      // tell the user how to succeed now.
      setSearchResults([]);
      setSearchMessage(
        'We could not find that address. Try including the city name, for example "Cebu City".',
      );
    }
  }, [searchText]);

  const handleSelectResult = (result: GeoResult): void => {
    setPin({ latitude: result.latitude, longitude: result.longitude });
    setSelectedAddress(result);
    setSearchResults([]);
    setSearchMessage('');
    mapRef.current?.animateToRegion({
      ...result,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
  };

  const handleConfirm = (): void => {
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
    setAddress(selectedAddress);
    router.back();
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
        <TextInput
          style={styles.searchInput}
          placeholder="Search for an address..."
          placeholderTextColor={colors.textTertiary}
          value={searchText}
          onChangeText={(t) => { setSearchText(t); if (searchMessage) setSearchMessage(''); }}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
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
          <View style={styles.selectedRow}>
            <MapPin size={16} color={colors.text} style={{ marginRight: 6, marginTop: 2 }} />
            <Text style={styles.selectedText} numberOfLines={2}>
              {[selectedAddress.address, selectedAddress.barangay, selectedAddress.city].filter(Boolean).join(', ')}
            </Text>
          </View>
        )}
        <Button
          title="Confirm Address"
          onPress={handleConfirm}
          disabled={!selectedAddress}
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
  searchInput: {
    ...typography.body,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    color: colors.text,
  },
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
});
