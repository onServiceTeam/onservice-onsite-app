import React, { useRef, useEffect } from 'react';
import {
  Animated,
  StyleSheet,
  TouchableOpacity,
  Text,
} from 'react-native';
import { hapticLight } from '@/utils/haptics';
import { colors } from '@/config/theme';
import { useTranslation } from '@/i18n/useTranslation';

interface ScrollToTopProps {
  visible: boolean;
  onPress: () => void;
}

export function ScrollToTop({ visible, onPress }: ScrollToTopProps): React.ReactElement | null {
  const scale = useRef(new Animated.Value(0)).current;
  const { t } = useTranslation();

  useEffect(() => {
    Animated.spring(scale, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
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
        accessibilityLabel={t('accessibility.scrollToTop')}
        accessibilityHint={t('accessibility.scrollToTopHint')}
      >
        <Text style={styles.arrow} accessibilityElementsHidden={true}>↑</Text>
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  arrow: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginTop: -2,
  },
});
