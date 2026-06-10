import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '@/config/theme';

interface NetInfoState { isConnected: boolean | null; isInternetReachable: boolean | null }
type NetInfoListener = (state: NetInfoState) => void;
interface NetInfoModule {
  addEventListener: (cb: NetInfoListener) => () => void;
  fetch: () => Promise<NetInfoState>;
}

let NetInfo: NetInfoModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  NetInfo = require('@react-native-community/netinfo') as NetInfoModule;
} catch {
  // Package not installed
}

export function OfflineBanner(): React.ReactElement | null {
  const [isOffline, setIsOffline] = useState(false);
  const opacity = useState(() => new Animated.Value(0))[0];
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // On web, NetInfo's connectivity probe is unreliable (its reachability
    // ping and even `isConnected` resolve to false on a perfectly online page,
    // which falsely shows the offline banner). The browser exposes accurate
    // connectivity via navigator.onLine + the window 'online'/'offline'
    // events, so use those directly on web and skip NetInfo entirely.
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
      const update = (): void => setIsOffline(navigator.onLine === false);
      update();
      window.addEventListener('online', update);
      window.addEventListener('offline', update);
      return () => {
        window.removeEventListener('online', update);
        window.removeEventListener('offline', update);
      };
    }

    if (!NetInfo) return;

    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false || state.isInternetReachable === false;
      setIsOffline(offline);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: isOffline ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isOffline, opacity]);

  // On web the banner is driven by navigator.onLine, so render it even when the
  // NetInfo native module is unavailable. On native, no NetInfo means no signal.
  if (Platform.OS !== 'web' && !NetInfo) return null;

  return (
    <Animated.View
      style={[styles.container, { opacity }]}
      pointerEvents={isOffline ? 'auto' : 'none'}
      accessibilityRole="alert"
      accessibilityLabel="You are offline. Some features may not be available."
      // The banner stays mounted at opacity 0 for the fade animation, which
      // leaves an always-on "offline" alert in the accessibility tree (screen
      // readers + the web aria snapshot announce it while online). Hide it
      // from assistive tech whenever it is not actually showing.
      accessibilityElementsHidden={!isOffline}
      importantForAccessibility={isOffline ? 'auto' : 'no-hide-descendants'}
    >
      <View style={[styles.inner, { paddingTop: insets.top + spacing.xs }]}>
        <Text style={styles.icon}>📡</Text>
        <Text style={styles.text}>You're offline. Some features may not be available.</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warning,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  icon: { fontSize: 14 },
  text: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
});
