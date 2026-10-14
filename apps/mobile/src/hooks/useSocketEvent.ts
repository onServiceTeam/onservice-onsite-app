/**
 * D38 Milestone 2: listen for one live-connection event from a component.
 *
 * Goes through socket.service subscribeSocketEvent, so the listener works
 * when it is added before the socket connects, survives every reconnect, and
 * removes only itself on unmount. The handler may change on every render;
 * the latest one is always called.
 */
import { useEffect, useRef, useState } from 'react';
import { isSocketConnected, onSocketStatus, subscribeSocketEvent } from '@/services/socket.service';

export function useSocketEvent<T = unknown>(
  event: string | null | undefined,
  handler: (payload: T) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!event) return undefined;
    return subscribeSocketEvent<T>(event, (payload) => handlerRef.current(payload));
  }, [event]);
}

/** True while the live connection is up. Re-renders on every change. */
export function useSocketConnected(): boolean {
  const [connected, setConnected] = useState<boolean>(() => isSocketConnected());
  useEffect(() => {
    setConnected(isSocketConnected());
    return onSocketStatus(setConnected);
  }, []);
  return connected;
}

export default useSocketEvent;
