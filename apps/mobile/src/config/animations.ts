import { Easing, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated';

/**
 * Standard screen transition configs for consistent motion across the app.
 * Use with expo-router layout options or React Navigation screenOptions.
 */

export const screenTransition = {
  slideFromRight: {
    animation: 'slide_from_right' as const,
    config: {
      duration: 280,
    },
  },
  slideFromBottom: {
    animation: 'slide_from_bottom' as const,
    config: {
      duration: 300,
    },
  },
  fade: {
    animation: 'fade' as const,
    config: {
      duration: 200,
    },
  },
  none: {
    animation: 'none' as const,
  },
} as const;

export const springPresets: Record<string, WithSpringConfig> = {
  gentle: {
    damping: 15,
    stiffness: 120,
    mass: 1,
    overshootClamping: false,
  },
  snappy: {
    damping: 20,
    stiffness: 200,
    mass: 0.8,
    overshootClamping: false,
  },
  bouncy: {
    damping: 10,
    stiffness: 150,
    mass: 1,
    overshootClamping: false,
  },
};

export const timingPresets: Record<string, WithTimingConfig> = {
  fast: {
    duration: 150,
    easing: Easing.out(Easing.cubic),
  },
  normal: {
    duration: 250,
    easing: Easing.inOut(Easing.cubic),
  },
  slow: {
    duration: 400,
    easing: Easing.inOut(Easing.quad),
  },
};

export const FADE_IN_DURATION = 200;
export const SLIDE_DURATION = 280;
export const STAGGER_DELAY = 50;
