import React, { useEffect, useRef, useCallback } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { hapticSuccess, hapticError, hapticWarning } from '@/utils/haptics';
import { colors } from '@/config/theme';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastState {
  visible: boolean;
  message: string;
  type: ToastType;
  show: (message: string, type?: ToastType) => void;
  hide: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  visible: false,
  message: '',
  type: 'info',
  show: (message, type = 'info'): void => {
    set({ visible: true, message, type });
  },
  hide: (): void => {
    set({ visible: false });
  },
}));

const TOAST_COLORS: Record<ToastType, { bg: string; text: string; icon: string }> = {
  success: { bg: colors.success, text: colors.white, icon: '✓' },
  error: { bg: colors.error, text: colors.white, icon: '✕' },
  warning: { bg: colors.warning, text: colors.text, icon: '!' },
  info: { bg: colors.info, text: colors.white, icon: 'i' },
};

const DISPLAY_DURATION = 3000;

export function ToastProvider(): React.ReactElement | null {
  const { visible, message, type, hide } = useToastStore();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const triggerHaptic = useCallback(async (toastType: ToastType) => {
    switch (toastType) {
      case 'success':
        await hapticSuccess();
        break;
      case 'error':
        await hapticError();
        break;
      case 'warning':
        await hapticWarning();
        break;
      default:
        break;
    }
  }, []);

  useEffect(() => {
    if (visible) {
      triggerHaptic(type).catch((err: unknown) => {
        // Haptics are best-effort — device may not support them; non-fatal.
        void err;
      });

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -100,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }),
        ]).start(() => hide());
      }, DISPLAY_DURATION);

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [visible, type, hide, translateY, opacity, triggerHaptic]);

  if (!visible) return null;

  const toastStyle = TOAST_COLORS[type];

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: insets.top + 8,
          backgroundColor: toastStyle.bg,
          transform: [{ translateY }],
          opacity,
        },
      ]}
      accessible={true}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`${type}: ${message}`}
    >
      <View style={styles.iconWrapper}>
        <Text
          style={[styles.icon, { color: toastStyle.text }]}
          accessibilityElementsHidden={true}
          importantForAccessibility="no"
        >
          {toastStyle.icon}
        </Text>
      </View>
      <Text
        style={[styles.message, { color: toastStyle.text }]}
        numberOfLines={2}
        maxFontSizeMultiplier={1.5}
      >
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  iconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 16,
    fontWeight: '700',
  },
  message: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
  },
});
