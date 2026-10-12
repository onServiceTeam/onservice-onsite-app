import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { usePathname } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { MessageSquare } from '@/components/icons';
import { TAB_BAR_HEIGHT } from '@/utils/responsive';
import { isTesterFeedbackEnabled, openFeedbackPage, SEND_FEEDBACK_HINT, SEND_FEEDBACK_LABEL } from './SendFeedbackLink';

export { TAB_BAR_HEIGHT };
export const FEEDBACK_BUTTON_BOTTOM_GAP = spacing.md;
// Space a tab screen leaves at the end of its scroll so the floating button
// (44px tall, FEEDBACK_BUTTON_BOTTOM_GAP above the tab bar) never sits on its
// last row.
export const FEEDBACK_BUTTON_CLEARANCE = 72;

/** True while the on-screen keyboard is open. iOS reports it before it
 * slides in ("will"); Android only after ("did"). The web app gets no
 * keyboard events, so this stays false there. */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subscriptions = [
      Keyboard.addListener(showEvent, () => setOpen(true)),
      Keyboard.addListener(hideEvent, () => setOpen(false)),
    ];
    return () => { subscriptions.forEach((subscription) => subscription.remove()); };
  }, []);
  return open;
}

interface TesterFeedbackButtonProps {
  /** The wide web app hides the tab bar (it has a side menu instead), so the
   * button drops to the bottom edge. */
  tabBarHidden?: boolean;
}

/**
 * Small floating "Feedback" button for tester builds only
 * (EXPO_PUBLIC_TESTER_FEEDBACK=1).
 *
 * It is mounted by the two tab layouts ((tabs)/_layout.tsx and
 * (provider-tabs)/_layout.tsx), so it shows only on the 8 tab screens, which
 * have no fixed action buttons at the bottom. Screens pushed on top of the
 * tabs (a job, a booking, checkout) cover it, so it can never sit on a
 * screen's main button. It was first mounted in the root layout and covered
 * the main job button on the provider job screen (review finding, 2026-10-12).
 *
 * Bottom-left, just above the tab bar. Hidden while the keyboard is open so it
 * never floats over a form field.
 */
export default function TesterFeedbackButton({ tabBarHidden = false }: TesterFeedbackButtonProps): React.ReactElement | null {
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const keyboardOpen = useKeyboardOpen();

  if (!isTesterFeedbackEnabled() || !isAuthenticated || !user || keyboardOpen) return null;

  const bottom = (tabBarHidden ? 0 : TAB_BAR_HEIGHT) + FEEDBACK_BUTTON_BOTTOM_GAP;
  return (
    <TouchableOpacity
      style={StyleSheet.flatten([styles.button, { bottom }])}
      onPress={() => openFeedbackPage(pathname)}
      accessibilityRole="button"
      accessibilityLabel={SEND_FEEDBACK_LABEL}
      accessibilityHint={SEND_FEEDBACK_HINT}
      testID="tester-feedback-button"
      activeOpacity={0.8}
    >
      <MessageSquare size={18} color={colors.white} />
      <Text style={styles.label}>Feedback</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    left: spacing.md,
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    // A white edge keeps it visible on top of the blue parts of screens.
    borderWidth: 2,
    borderColor: colors.white,
    zIndex: 50,
    elevation: 6,
  },
  label: { ...typography.caption, color: colors.white, fontWeight: '700' },
});
