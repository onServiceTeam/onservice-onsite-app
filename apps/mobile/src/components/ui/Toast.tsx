import React, { useEffect, useRef, useCallback } from 'react';
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { hapticSuccess, hapticError, hapticWarning } from '@/utils/haptics';
import { colors } from '@/config/theme';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastState {
  visible: boolean;
  message: string;
  type: ToastType;
  // Phase K MED-K22 fix — onAction is rendered as an inline button
  // when set (e.g. "Retry" for error toasts). actionLabel is the
  // button label.
  onAction?: (() => void) | null;
  actionLabel?: string | null;
  show: (
    message: string,
    type?: ToastType,
    opts?: { onAction?: () => void; actionLabel?: string },
  ) => void;
  hide: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  visible: false,
  message: '',
  type: 'info',
  onAction: null,
  actionLabel: null,
  show: (message, type = 'info', opts): void => {
    set({
      visible: true,
      message,
      type,
      onAction: opts?.onAction ?? null,
      actionLabel: opts?.actionLabel ?? null,
    });
  },
  hide: (): void => {
    set({ visible: false, onAction: null, actionLabel: null });
  },
}));

const TOAST_COLORS: Record<ToastType, { bg: string; text: string; icon: string }> = {
  success: { bg: colors.success, text: colors.white, icon: '✓' },
  error: { bg: colors.error, text: colors.white, icon: '✕' },
  warning: { bg: colors.warning, text: colors.text, icon: '!' },
  info: { bg: colors.info, text: colors.white, icon: 'i' },
};

// Phase K MED-K19 fix — display duration is now severity-aware so a
// transient 'success' confirmation doesn't block the screen for the
// same duration as a critical 'error' the user needs time to read +
// (per MED-K22) tap an action on. Pre-fix all severities were 3 s.
const DISPLAY_DURATION_MS: Record<ToastType, number> = {
  success: 2200,
  info: 3000,
  warning: 4000,
  error: 5500,
};

export function ToastProvider(): React.ReactElement | null {
  const { visible, message, type, onAction, actionLabel, hide } = useToastStore();
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
          useNativeDriver: Platform.OS !== 'web',
          tension: 80,
          friction: 10,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();

      // MED-K19 — severity-aware duration
      const duration = DISPLAY_DURATION_MS[type] ?? 3000;
      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -100,
            duration: 250,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 250,
            useNativeDriver: Platform.OS !== 'web',
          }),
        ]).start(() => hide());
      }, duration);

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
      {/* Phase K MED-K22 fix — render an inline action button when
           caller passed onAction (e.g. "Retry" for error toasts).
           Pre-fix showRetryableToast accepted an onRetry callback
           but the button was never rendered, so the user could see
           the error but had no recovery affordance from the toast. */}
      {onAction && actionLabel ? (
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            try {
              onAction();
            } finally {
              hide();
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text
            style={[styles.actionLabel, { color: toastStyle.text }]}
            maxFontSizeMultiplier={1.5}
          >
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
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
  // Phase K MED-K22 — inline action button styling.
  actionButton: {
    marginLeft: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
