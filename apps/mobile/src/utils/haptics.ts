import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
// Phase K MED-K18 fix — haptics now respect the user's reduce-motion
// preference. Pre-fix every Button press / Toast / list scroll fired
// haptic feedback regardless of accessibility settings, which causes
// vestibular discomfort for users who enable reduce-motion in their
// device settings or in the app's a11y settings.
//
// We avoid a hard import dependency cycle by using require() inside
// each haptic call (the store may not be initialized in test runtime
// or during very-early app boot). Fallback: if the store isn't
// available, haptics fire as before.
//

type AccessibilityStoreModule = {
  useAccessibilityStore: { getState: () => { reduceMotionEnabled: boolean } };
};

const isHapticsSupported = Platform.OS === 'ios' || Platform.OS === 'android';

function shouldSuppressHaptics(): boolean {
  if (!isHapticsSupported) return true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/stores/accessibility.store') as AccessibilityStoreModule;
    return mod.useAccessibilityStore.getState().reduceMotionEnabled === true;
  } catch {
    return false;
  }
}

export async function hapticLight(): Promise<void> {
  if (shouldSuppressHaptics()) return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch { /* haptics unavailable */ }
}

export async function hapticMedium(): Promise<void> {
  if (shouldSuppressHaptics()) return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch { /* haptics unavailable */ }
}

export async function hapticHeavy(): Promise<void> {
  if (shouldSuppressHaptics()) return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } catch { /* haptics unavailable */ }
}

export async function hapticSuccess(): Promise<void> {
  if (shouldSuppressHaptics()) return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch { /* haptics unavailable */ }
}

export async function hapticWarning(): Promise<void> {
  if (shouldSuppressHaptics()) return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch { /* haptics unavailable */ }
}

export async function hapticError(): Promise<void> {
  if (shouldSuppressHaptics()) return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch { /* haptics unavailable */ }
}

export async function hapticSelection(): Promise<void> {
  if (shouldSuppressHaptics()) return;
  try {
    await Haptics.selectionAsync();
  } catch { /* haptics unavailable */ }
}
