import { useEffect, useRef } from 'react';
import { isApplicationLeaseCurrent, useApplicationSession } from '@/stores/provider-application-session.store';

/** Bind a picker/location/upload chain to this screen and applicant session. */
export function useApplicationOperation(onInvalidate?: () => void): { begin: () => (() => boolean) | null; cancel: () => void } {
  const session = useApplicationSession();
  const sequence = useRef(0);
  const mounted = useRef(true);
  const resetControls = useRef(onInvalidate);
  resetControls.current = onInvalidate;
  useEffect(() => { resetControls.current?.(); }, [session.ownerId, session.generation, session.routeEpoch]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; sequence.current += 1; };
  }, []);
  const lease = session.ownerId ? { ownerId: session.ownerId, generation: session.generation } : null;
  return {
    begin: () => {
      const current = useApplicationSession.getState();
      if (!lease || !mounted.current || !isApplicationLeaseCurrent(lease)
        || current.phase !== 'ready' || current.busy || current.conflict) return null;
      const operation = ++sequence.current;
      return () => mounted.current && sequence.current === operation && isApplicationLeaseCurrent(lease)
        && useApplicationSession.getState().routeEpoch === session.routeEpoch;
    },
    cancel: () => { sequence.current += 1; },
  };
}
