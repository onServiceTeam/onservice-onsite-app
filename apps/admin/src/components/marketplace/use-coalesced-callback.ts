/**
 * D38 Milestone 3 (review fix): fold a burst of admin socket events into at
 * most two runs.
 *
 * The one-minute marketplace sweep announces every new alert with its own
 * alert:new event, up to 50 in one sweep (marketplace-alert.service
 * SOCKET_EMIT_CAP), all sent right after its commit. Reloading on every event
 * sent one request per event from every screen that listens (the banner,
 * Waiting now, the Command Center), and the API's global limit is 100
 * requests per operator per 15 minutes by default (rate_limit_max_requests).
 * A burst could lock the operator out of the whole admin with "Too many
 * requests" while red alerts were open.
 *
 * The returned trigger runs the callback at once on the first call. Further
 * calls during the next windowMs are folded into one more run when that
 * window closes (so an event that arrives after the first reload started is
 * never lost); quiet windows end with no extra run. Each screen keeps one
 * reload of its own query per window, and no two screens reload the same
 * query.
 */
import { useCallback, useEffect, useRef } from 'react';

/** The burst window for alert:new reloads. */
export const ALERT_REFRESH_WINDOW_MS = 3_000;

export function useCoalescedCallback(callback: () => void, windowMs: number = ALERT_REFRESH_WINDOW_MS): () => void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pending.current = false;
  }, []);

  return useCallback(() => {
    if (timer.current !== null) {
      pending.current = true;
      return;
    }
    callbackRef.current();
    const closeWindow = (): void => {
      if (!pending.current) {
        timer.current = null;
        return;
      }
      pending.current = false;
      callbackRef.current();
      timer.current = setTimeout(closeWindow, windowMs);
    };
    timer.current = setTimeout(closeWindow, windowMs);
  }, [windowMs]);
}
