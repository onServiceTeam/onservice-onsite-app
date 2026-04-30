/**
 * Phase 14 Dispatch 12 — Pattern: app-state lifecycle hook.
 *
 * Tracks foreground/background transitions and elapsed time in background.
 * Used for Bug 1203 (auto-off online status after 15 min in background)
 * and the GPS lifecycle in useJobGpsBroadcast.
 */

import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

export interface AppStateInfo {
  state: AppStateStatus;
  /** Milliseconds since most recent transition into 'background'. */
  backgroundMs: number;
}

export function useAppState(): AppStateInfo {
  const [state, setState] = useState<AppStateStatus>(AppState.currentState);
  const [backgroundMs, setBackgroundMs] = useState(0);
  const enteredBgAt = useRef<number | null>(
    AppState.currentState === 'background' ? Date.now() : null,
  );
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        enteredBgAt.current = Date.now();
        if (timer.current) clearInterval(timer.current);
        timer.current = setInterval(() => {
          if (enteredBgAt.current) {
            setBackgroundMs(Date.now() - enteredBgAt.current);
          }
        }, 30_000);
      } else if (next === 'active') {
        enteredBgAt.current = null;
        setBackgroundMs(0);
        if (timer.current) {
          clearInterval(timer.current);
          timer.current = null;
        }
      }
      setState(next);
    });

    return () => {
      sub.remove();
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  return { state, backgroundMs };
}

export default useAppState;
