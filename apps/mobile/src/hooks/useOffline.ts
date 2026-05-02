import { useState, useEffect, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Detect online/offline state. Returns `true` when the device has no
 * internet connectivity. Screens should check `isOffline` and show an
 * offline banner + disable network actions.
 *
 * Phase K MED-K23 fix — prefer NetInfo events over polling.
 *
 * Pre-fix: this hook polled `expo-network.getNetworkStateAsync()` every
 * 30 seconds. That meant up to 30 seconds of stale state after a
 * connectivity change AND wasted battery on background polling.
 *
 * Post-fix: subscribe to `@react-native-community/netinfo` event
 * stream when available — connectivity transitions surface in
 * near-realtime. Falls back to expo-network + a 60-second polling
 * interval (doubled from 30s since AppState 'active' transitions
 * already trigger an immediate check) when NetInfo isn't installed.
 *
 * The fallback is dynamic so RN test runtimes that don't bundle
 * NetInfo still work.
 */
type NetInfoState = { isInternetReachable: boolean | null };
type NetInfoModule = {
  addEventListener: (cb: (state: NetInfoState) => void) => () => void;
  fetch: () => Promise<NetInfoState>;
};

export function useOffline(): boolean {
  const [isOffline, setIsOffline] = useState(false);

  const checkConnectivityFallback = useCallback(async () => {
    try {
      const Network = await import('expo-network');
      const state = await Network.getNetworkStateAsync();
      setIsOffline(!state.isInternetReachable);
    } catch {
      setIsOffline(false);
    }
  }, []);

  useEffect(() => {
    let unsubscribeNetInfo: (() => void) | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let appStateSubscription: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      // MED-K23 — prefer NetInfo events.
      try {
        const mod = await import('@react-native-community/netinfo');
        const NetInfo = (mod as unknown as { default: NetInfoModule }).default
          ?? (mod as unknown as NetInfoModule);
        const initial = await NetInfo.fetch();
        if (cancelled) return;
        setIsOffline(initial.isInternetReachable === false);
        unsubscribeNetInfo = NetInfo.addEventListener((state) => {
          setIsOffline(state.isInternetReachable === false);
        });
        return;
      } catch {
        // NetInfo unavailable — fall back to expo-network + polling.
      }

      if (cancelled) return;

      void checkConnectivityFallback();
      const handleAppState = (nextState: AppStateStatus): void => {
        if (nextState === 'active') {
          void checkConnectivityFallback();
        }
      };
      appStateSubscription = AppState.addEventListener('change', handleAppState);
      // Poll every 60 seconds in fallback mode (was 30s pre-fix).
      pollInterval = setInterval(() => {
        void checkConnectivityFallback();
      }, 60_000);
    })();

    return () => {
      cancelled = true;
      unsubscribeNetInfo?.();
      appStateSubscription?.remove();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [checkConnectivityFallback]);

  return isOffline;
}
