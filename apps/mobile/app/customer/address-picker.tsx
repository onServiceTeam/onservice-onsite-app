import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, type Region } from 'react-native-maps';
import { useBookingStore } from '@/stores/booking.store';
import { Button } from '@/components/ui';
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
  { lat: 10.3157, lng: 123.8854, city: 'Cebu City', province: 'Cebu' },
  { lat: 7.0732, lng: 125.6126, city: 'Davao City', province: 'Davao del Sur' },
  { lat: 8.4542, lng: 124.6319, city: 'Cagayan de Oro', province: 'Misamis Oriental' },
  { lat: 10.6918, lng: 122.5623, city: 'Iloilo City', province: 'Iloilo' },
  { lat: 16.4023, lng: 120.5960, city: 'Baguio', province: 'Benguet' },
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

export default function AddressPickerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setAddress = useBookingStore((s) => s.setAddress);
  const mapRef = useRef<MapView>(null);

  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [searchText, setSearchText] = useState('');
  const [selectedAddress, setSelectedAddress] = useState<GeoResult | null>(null);
  const [searchResults, setSearchResults] = useState<GeoResult[]>([]);

  const handleMapPress = useCallback((e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
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

  // TODO: Replace with Google Places / geocoding API
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

  const handleSelectResult = (result: GeoResult) => {
    setPin({ latitude: result.latitude, longitude: result.longitude });
    setSelectedAddress(result);
    setSearchResults([]);
    mapRef.current?.animateToRegion({
      ...result,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
  };

  const handleConfirm = () => {
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
  backButton: { padding: spacing.sm, marginRight: spacing.sm },
  backIcon: { fontSize: 24, color: colors.text },
  title: { ...typography.h3, color: colors.text },
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
    shadowColor: '#000',
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
