import { useState, useEffect, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Detect online/offline state using expo-network (with graceful fallback).
 * Returns `true` when the device has no internet connectivity.
 *
 * Screens should check `isOffline` and show an offline banner + disable network actions.
 */
export function useOffline(): boolean {
  const [isOffline, setIsOffline] = useState(false);

  const checkConnectivity = useCallback(async () => {
    try {
      const Network = await import('expo-network');
      const state = await Network.getNetworkStateAsync();
      setIsOffline(!state.isInternetReachable);
    } catch {
      // expo-network not available (web, test env) — assume online
      setIsOffline(false);
    }
  }, []);

  useEffect(() => {
    // Initial check
    void checkConnectivity();

    // Re-check when app comes to foreground
    const handleAppState = (nextState: AppStateStatus): void => {
      if (nextState === 'active') {
        void checkConnectivity();
      }
    };
    const subscription = AppState.addEventListener('change', handleAppState);

    // Poll every 30 seconds while active
    const interval = setInterval(() => {
      void checkConnectivity();
    }, 30_000);

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [checkConnectivity]);

  return isOffline;
}
