import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { hapticSuccess } from '@/utils/haptics';
import { colors } from '@/config/theme';
import { useTranslation } from '@/i18n/useTranslation';

interface SuccessAnimationProps {
  visible: boolean;
  message?: string;
  size?: number;
  onComplete?: () => void;
}

export function SuccessAnimation({
  visible,
  message,
  size = 80,
  onComplete,
}: SuccessAnimationProps): React.ReactElement | null {
  const scale = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const messageOpacity = useRef(new Animated.Value(0)).current;
  const { t } = useTranslation();

  useEffect(() => {
    if (!visible) {
      scale.setValue(0);
      checkOpacity.setValue(0);
      messageOpacity.setValue(0);
      return;
    }

    hapticSuccess().catch(() => {});

    Animated.sequence([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 60,
        friction: 6,
      }),
      Animated.timing(checkOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(messageOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (onComplete) {
        setTimeout(onComplete, 1200);
      }
    });
  }, [visible, scale, checkOpacity, messageOpacity, onComplete]);

  if (!visible) return null;

  return (
    <View
      style={styles.wrapper}
      accessible={true}
      accessibilityRole="alert"
      accessibilityLabel={message ?? t('common.success')}
      accessibilityLiveRegion="polite"
    >
      <Animated.View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            transform: [{ scale }],
          },
        ]}
        accessibilityElementsHidden={true}
      >
        <Animated.Text
          style={[
            styles.checkmark,
            { fontSize: size * 0.45, opacity: checkOpacity },
          ]}
        >
          ✓
        </Animated.Text>
      </Animated.View>
      {message ? (
        <Animated.Text
          style={[styles.message, { opacity: messageOpacity }]}
          maxFontSizeMultiplier={2}
        >
          {message}
        </Animated.Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  circle: {
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  checkmark: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  message: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
});
