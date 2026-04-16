import { useState, useCallback } from 'react';
import { Alert, Linking, Platform } from 'react-native';

interface LocationCoords {
  latitude: number;
  longitude: number;
}

interface LocationModule {
  requestForegroundPermissionsAsync: () => Promise<{ status: string }>;
  getCurrentPositionAsync: (opts: { accuracy: number }) => Promise<{
    coords: { latitude: number; longitude: number };
  }>;
  Accuracy: { Balanced: number };
}

let Location: LocationModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Location = require('expo-location') as LocationModule;
} catch {
  // expo-location not installed
}

interface UseLocationReturn {
  isAvailable: boolean;
  isLoading: boolean;
  getCurrentLocation: () => Promise<LocationCoords | null>;
}

export function useLocation(): UseLocationReturn {
  const [isLoading, setIsLoading] = useState(false);

  const promptOpenSettings = useCallback(() => {
    Alert.alert(
      'Location Permission Required',
      'To use your current location, please enable location access in your device settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: () => {
            if (Platform.OS === 'ios') {
              void Linking.openURL('app-settings:');
            } else {
              void Linking.openSettings();
            }
          },
        },
      ],
    );
  }, []);

  const getCurrentLocation = useCallback(async (): Promise<LocationCoords | null> => {
    if (!Location) {
      Alert.alert('Not Available', 'Location services are not available on this device.');
      return null;
    }

    setIsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        promptOpenSettings();
        return null;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    } catch {
      Alert.alert('Location Error', 'Could not determine your current location. Please try again or select manually.');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [promptOpenSettings]);

  return {
    isAvailable: Location !== null,
    isLoading,
    getCurrentLocation,
  };
}
