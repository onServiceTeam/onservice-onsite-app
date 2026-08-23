import React, { useRef, useEffect } from 'react';
import { Animated, Platform, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { hapticLight } from '@/utils/haptics';
import { colors } from '@/config/theme';

interface ScrollToTopProps {
  visible: boolean;
  onPress: () => void;
}

export function ScrollToTop({ visible, onPress }: ScrollToTopProps): React.ReactElement | null {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: visible ? 1 : 0,
      useNativeDriver: Platform.OS !== 'web',
      tension: 100,
      friction: 8,
    }).start();
  }, [visible, scale]);

  const handlePress = async (): Promise<void> => {
    await hapticLight();
    onPress();
  };

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.container,
        {
          transform: [{ scale }],
          opacity: scale,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.button}
        onPress={handlePress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Scroll to top"
        accessibilityHint="Double tap to scroll to the top of the list"
      >
        <Text style={styles.arrow} accessibilityElementsHidden={true}>
          ↑
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    zIndex: 999,
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  arrow: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '700',
    marginTop: -2,
  },
});
