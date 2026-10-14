/**
 * D38 Milestone 2: how often a screen re-reads its data.
 *
 * The global API rate limit is 100 requests per user per 15 minutes, so a
 * screen polls only while it is on screen (focused) and the app is in the
 * foreground, slowly while the live connection is up and faster while it is
 * down. Returns a react-query `refetchInterval` (milliseconds, or false to
 * stop).
 *
 * Focus comes from expo-router's useFocusEffect. Test routers that do not
 * provide it fall back to "focused while mounted".
 */
import { useCallback, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as ExpoRouter from 'expo-router';
import { useSocketConnected } from './useSocketEvent';

type FocusEffect = (effect: () => void | (() => void)) => void;

function useMountedAsFocused(effect: () => void | (() => void)): void {
  useEffect(effect, [effect]);
}

const routerFocusEffect = (ExpoRouter as unknown as { useFocusEffect?: FocusEffect }).useFocusEffect;
const useFocusEffectSafe: FocusEffect = typeof routerFocusEffect === 'function'
  ? routerFocusEffect
  : useMountedAsFocused;

/** True while this screen is the focused one. */
export function useScreenFocused(): boolean {
  const [focused, setFocused] = useState(true);
  const effect = useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []);
  useFocusEffectSafe(effect);
  return focused;
}

/** True while the app is in the foreground. */
export function useAppActive(): boolean {
  const [active, setActive] = useState(() => AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      setActive(state === 'active');
    });
    return () => subscription?.remove?.();
  }, []);
  return active;
}

export interface PollIntervals {
  /** Interval while the live connection is up (events do most of the work). */
  connectedMs: number | false;
  /** Interval while the live connection is down. */
  disconnectedMs: number | false;
  /** Turn polling off entirely (for example before the data exists). */
  enabled?: boolean;
}

export function usePollWhileFocused({ connectedMs, disconnectedMs, enabled = true }: PollIntervals): number | false {
  const focused = useScreenFocused();
  const active = useAppActive();
  const connected = useSocketConnected();
  if (!enabled || !focused || !active) return false;
  return connected ? connectedMs : disconnectedMs;
}

export default usePollWhileFocused;
