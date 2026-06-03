// apps/mobile/src/utils/web-alert.ts
//
// Phase 200 — make React Native's `Alert.alert` work on the web build.
//
// THE BUG THIS FIXES: react-native-web's Alert.alert is a near-no-op. It does
// not render a dialog and it ignores the `buttons` array entirely, so every
// confirmation, error, and success alert in the app silently does nothing on
// web. That meant "Log out", "Cancel booking", "Delete card", payment errors,
// validation errors — 233 Alert.alert call sites across 57 files — all looked
// like dead buttons or gave no feedback in the browser.
//
// THE FIX: on web we replace Alert.alert with a function that pushes the alert
// into a small store; a single <AlertHost/> mounted at the app root renders it
// as an on-brand modal and wires each button's onPress. Native iOS/Android are
// untouched (the real OS Alert keeps working). Because we override the platform
// method itself, all existing call sites work unchanged — no per-screen edits.
import { Alert, Platform } from 'react-native';
import { create } from 'zustand';

export interface WebAlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface WebAlertState {
  visible: boolean;
  title: string;
  message?: string;
  buttons: WebAlertButton[];
  show: (title: string, message?: string, buttons?: WebAlertButton[]) => void;
  hide: () => void;
}

export const useWebAlertStore = create<WebAlertState>((set) => ({
  visible: false,
  title: '',
  message: undefined,
  buttons: [],
  show: (title, message, buttons) =>
    set({
      visible: true,
      title: title ?? '',
      message,
      buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK', style: 'default' }],
    }),
  hide: () => set({ visible: false }),
}));

let installed = false;

/**
 * Install the web Alert shim. Safe to call multiple times; only the first call
 * on web does anything. No-op on native.
 */
export function installWebAlert(): void {
  if (installed || Platform.OS !== 'web') return;
  installed = true;
  const shim = (
    title: string,
    message?: string,
    buttons?: WebAlertButton[],
  ): void => {
    useWebAlertStore.getState().show(title, message, buttons);
  };
  // Reassign the platform method. On web this replaces react-native-web's
  // no-op implementation.
  (Alert as unknown as { alert: typeof shim }).alert = shim;
}
