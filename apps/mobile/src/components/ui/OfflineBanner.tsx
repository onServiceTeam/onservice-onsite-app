import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Animated } from 'react-native';
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

  if (!NetInfo) return null;

  return (
    <Animated.View
      style={[styles.container, { opacity }]}
      pointerEvents={isOffline ? 'auto' : 'none'}
      accessibilityRole="alert"
      accessibilityLabel="You are offline. Some features may not be available."
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
