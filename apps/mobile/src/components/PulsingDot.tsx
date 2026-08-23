/**
 * Phase 14 Dispatch 11 — PulsingDot
 *
 * Live-tracking indicator used on booking-detail when provider is en_route
 * or in_progress. Provides a clear "this data is live, not stale" signal
 * that complements the socket-driven status updates.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Easing, Platform } from 'react-native';
import { colors } from '@/config/theme';

export interface PulsingDotProps {
  size?: number;
  color?: string;
  testID?: string;
}

export function PulsingDot({
  size = 10,
  color = colors.success,
  testID,
}: PulsingDotProps): React.ReactElement {
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0.4,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(scale, {
            toValue: 1.4,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: Platform.OS !== 'web',
          }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: Platform.OS !== 'web',
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, scale]);

  return (
    <View style={styles.wrap} testID={testID} accessibilityLabel="Live indicator">
      <Animated.View
        style={[
          styles.dot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            opacity,
            transform: [{ scale }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 2 },
  dot: {},
});

export default PulsingDot;
