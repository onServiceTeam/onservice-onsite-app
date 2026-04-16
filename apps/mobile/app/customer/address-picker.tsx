import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, type Region } from 'react-native-maps';
import { useQuery } from '@tanstack/react-query';
import { useBookingStore } from '@/stores/booking.store';
import { useLocation } from '@/hooks/useLocation';
import { Button } from '@/components/ui';
import * as addressService from '@/services/address.service';
import type { SavedAddress } from '@/services/address.service';
import { colors, spacing, typography, borderRadius } from '@/config/theme';

const MANILA_REGION: Region = {
  latitude: 14.5995,
  longitude: 120.9842,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

interface GeoResult {
  address: string;
  barangay: string;
  city: string;
  province: string;
  latitude: number;
  longitude: number;
}

const PH_REGIONS: { lat: number; lng: number; city: string; province: string }[] = [
  { lat: 14.5995, lng: 120.9842, city: 'Manila', province: 'Metro Manila' },
  { lat: 14.6507, lng: 121.0495, city: 'Quezon City', province: 'Metro Manila' },
  { lat: 14.5547, lng: 121.0244, city: 'Makati', province: 'Metro Manila' },
  { lat: 14.5764, lng: 121.0851, city: 'Pasig', province: 'Metro Manila' },
  { lat: 14.5176, lng: 121.0509, city: 'Taguig', province: 'Metro Manila' },
  { lat: 14.4793, lng: 121.0198, city: 'Parañaque', province: 'Metro Manila' },
  { lat: 14.6570, lng: 120.9790, city: 'Caloocan', province: 'Metro Manila' },
  { lat: 14.6042, lng: 120.9822, city: 'San Juan', province: 'Metro Manila' },
  { lat: 14.5378, lng: 121.0014, city: 'Pasay', province: 'Metro Manila' },
  { lat: 14.5832, lng: 120.9783, city: 'Mandaluyong', province: 'Metro Manila' },
  { lat: 14.6588, lng: 121.1107, city: 'Marikina', province: 'Metro Manila' },
  { lat: 14.4445, lng: 120.9940, city: 'Las Piñas', province: 'Metro Manila' },
  { lat: 14.4163, lng: 121.0437, city: 'Muntinlupa', province: 'Metro Manila' },
  { lat: 10.3157, lng: 123.8854, city: 'Cebu City', province: 'Cebu' },
  { lat: 7.0732, lng: 125.6126, city: 'Davao City', province: 'Davao del Sur' },
  { lat: 8.4542, lng: 124.6319, city: 'Cagayan de Oro', province: 'Misamis Oriental' },
  { lat: 10.6918, lng: 122.5623, city: 'Iloilo City', province: 'Iloilo' },
  { lat: 16.4023, lng: 120.5960, city: 'Baguio', province: 'Benguet' },
  { lat: 14.8149, lng: 120.9640, city: 'Malolos', province: 'Bulacan' },
  { lat: 14.2139, lng: 121.1652, city: 'Calamba', province: 'Laguna' },
  { lat: 15.4857, lng: 120.9715, city: 'Angeles', province: 'Pampanga' },
  { lat: 14.3494, lng: 120.9553, city: 'Bacoor', province: 'Cavite' },
];

function guessRegionFromCoordinates(lat: number, lng: number): { city: string; province: string } {
  let closest = PH_REGIONS[0]!;
  let minDist = Infinity;
  for (const r of PH_REGIONS) {
    const d = Math.sqrt((r.lat - lat) ** 2 + (r.lng - lng) ** 2);
    if (d < minDist) { minDist = d; closest = r; }
  }
  if (minDist > 0.5) return { city: '', province: '' };
  return { city: closest.city, province: closest.province };
}

const LABEL_ICONS: Record<string, string> = { Home: '🏠', Work: '🏢', Other: '📌' };

export default function AddressPickerScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setAddress = useBookingStore((s) => s.setAddress);
  const mapRef = useRef<MapView>(null);
  const { isAvailable: gpsAvailable, isLoading: gpsLoading, getCurrentLocation } = useLocation();

  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [searchText, setSearchText] = useState('');
  const [selectedAddress, setSelectedAddress] = useState<GeoResult | null>(null);
  const [searchResults, setSearchResults] = useState<GeoResult[]>([]);

  const { data: savedAddresses } = useQuery({
    queryKey: ['saved-addresses'],
    queryFn: addressService.getAddresses,
    staleTime: 60 * 1000,
  });

  const handleSelectSaved = useCallback((addr: SavedAddress) => {
    const geo: GeoResult = {
      address: addr.fullAddress,
      barangay: addr.barangay,
      city: addr.city,
      province: addr.province,
      latitude: addr.latitude ?? 14.5995,
      longitude: addr.longitude ?? 120.9842,
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
    const query = searchText.trim().toLowerCase();
    const match = PH_REGIONS.find(
      (r) => r.city.toLowerCase().includes(query) || r.province.toLowerCase().includes(query),
    );
    if (match) {
      setSearchResults([{
        address: searchText.trim(),
        barangay: '',
        city: match.city,
        province: match.province,
        latitude: match.lat,
        longitude: match.lng,
      }]);
    } else {
      setSearchResults([{
        address: searchText.trim(),
        barangay: '',
        city: '',
        province: '',
        latitude: 14.5995,
        longitude: 120.9842,
      }]);
    }
  }, [searchText]);

  const handleSelectResult = (result: GeoResult): void => {
    setPin({ latitude: result.latitude, longitude: result.longitude });
    setSelectedAddress(result);
    setSearchResults([]);
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
          onChangeText={setSearchText}
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
              <Text style={styles.resultIcon}>📍</Text>
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

      {savedAddresses && savedAddresses.length > 0 && searchResults.length === 0 && (
        <View style={styles.savedSection}>
          <Text style={styles.savedLabel}>Saved Addresses</Text>
          {savedAddresses.map((addr) => (
            <TouchableOpacity
              key={addr.id}
              style={styles.savedItem}
              onPress={() => handleSelectSaved(addr)}
            >
              <Text style={styles.savedIcon}>
                {LABEL_ICONS[addr.label] ?? '📌'}
              </Text>
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
          ))}
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
            <Text style={styles.myLocationIcon}>📍</Text>
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
        initialRegion={MANILA_REGION}
        onPress={handleMapPress}
      >
        {pin && <Marker coordinate={pin} />}
      </MapView>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.base }]}>
        {selectedAddress && (
          <Text style={styles.selectedText} numberOfLines={2}>
            📍 {[selectedAddress.address, selectedAddress.barangay, selectedAddress.city].filter(Boolean).join(', ')}
          </Text>
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
  container: { flex: 1, backgroundColor: colors.background },
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
  myLocationIcon: { fontSize: 16 },
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
  resultIcon: { fontSize: 16, marginRight: spacing.sm, marginTop: 2 },
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
  selectedText: {
    ...typography.bodySmall,
    color: colors.text,
    marginBottom: spacing.md,
  },
});
