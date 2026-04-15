import { create } from 'zustand';
import { setPublicItem, getPublicItem } from '../services/secure-storage.service';

interface AccessibilityState {
  highContrastEnabled: boolean;
  reduceMotionEnabled: boolean;
  fontScale: number;

  setHighContrast: (enabled: boolean) => void;
  setReduceMotion: (enabled: boolean) => void;
  setFontScale: (scale: number) => void;
  loadPreferences: () => void;
}

const A11Y_KEY = 'a11y_preferences';

function persistPreferences(state: Pick<AccessibilityState, 'highContrastEnabled' | 'reduceMotionEnabled' | 'fontScale'>): void {
  try {
    setPublicItem(A11Y_KEY, JSON.stringify({
      highContrastEnabled: state.highContrastEnabled,
      reduceMotionEnabled: state.reduceMotionEnabled,
      fontScale: state.fontScale,
    }));
  } catch {
    // Storage unavailable — continue with in-memory defaults
  }
}

export const useAccessibilityStore = create<AccessibilityState>((set, get) => ({
  highContrastEnabled: false,
  reduceMotionEnabled: false,
  fontScale: 1.0,

  setHighContrast: (enabled: boolean): void => {
    set({ highContrastEnabled: enabled });
    persistPreferences({ ...get(), highContrastEnabled: enabled });
  },

  setReduceMotion: (enabled: boolean): void => {
    set({ reduceMotionEnabled: enabled });
    persistPreferences({ ...get(), reduceMotionEnabled: enabled });
  },

  setFontScale: (scale: number): void => {
    const clamped = Math.min(Math.max(scale, 1.0), 2.0);
    set({ fontScale: clamped });
    persistPreferences({ ...get(), fontScale: clamped });
  },

  loadPreferences: (): void => {
    try {
      const raw = getPublicItem(A11Y_KEY);
      if (raw) {
        const prefs = JSON.parse(raw) as {
          highContrastEnabled?: boolean;
          reduceMotionEnabled?: boolean;
          fontScale?: number;
        };
        set({
          highContrastEnabled: prefs.highContrastEnabled ?? false,
          reduceMotionEnabled: prefs.reduceMotionEnabled ?? false,
          fontScale: prefs.fontScale ?? 1.0,
        });
      }
    } catch {
      // Corrupted data — use defaults
    }
  },
}));
