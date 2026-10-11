import { useCallback, useEffect, useState } from 'react';
import api, { storage } from '@/services/api';

/**
 * D37 (Ken, 2026-10-11): which sign-in methods the server has switched on.
 *
 * SMS cannot be delivered in the Philippines until the carriers receive our
 * corporate documents, so phone codes are paused on the server and email
 * codes replace them. The sign-in screens ask the server every time they
 * open (GET /api/v1/auth/methods, never cached), so turning phone codes back
 * on later is a server setting: the web app and installed APKs follow it
 * without a new release.
 *
 * While the answer is loading the screens show neither form. If the server
 * cannot be reached, the last answer this device received is used, or else
 * the server's own default (phone codes on, email codes off), so a slow
 * network can never hide the method that actually works. An older server that
 * predates the switch (phoneOtp.supported without enabled) means phone on.
 */
export interface AuthMethods {
  status: 'loading' | 'ready' | 'unavailable';
  phone: boolean;
  email: boolean;
  codeLength: number;
  validForMs: number;
  resendCooldownMs: number;
}

export const AUTH_METHOD_DEFAULTS = { codeLength: 6, validForMs: 300_000, resendCooldownMs: 30_000 } as const;
const SERVER_DEFAULT = { phone: true, email: false } as const;
const LAST_KNOWN_KEY = 'authMethods.lastKnown';

function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function lastKnown(): { phone: boolean; email: boolean } {
  try {
    const parsed = JSON.parse(storage.getString(LAST_KNOWN_KEY) ?? 'null') as { phone?: unknown; email?: unknown } | null;
    if (parsed && typeof parsed.phone === 'boolean' && typeof parsed.email === 'boolean') {
      return { phone: parsed.phone, email: parsed.email };
    }
  } catch { /* no storage or nothing saved */ }
  return { ...SERVER_DEFAULT };
}

function remember(methods: { phone: boolean; email: boolean }): void {
  try { storage.set(LAST_KNOWN_KEY, JSON.stringify(methods)); } catch { /* best effort */ }
}

export async function fetchAuthMethods(): Promise<Omit<AuthMethods, 'status'>> {
  const response = await api.get('/api/v1/auth/methods', { auth: 'anonymous' });
  const data = (response?.data as { data?: unknown } | undefined)?.data as {
    phoneOtp?: { supported?: unknown; enabled?: unknown };
    emailCode?: { enabled?: unknown; codeLength?: unknown; validForMs?: unknown; resendCooldownMs?: unknown };
  } | undefined;
  // A server from before D37 reports phoneOtp.supported only: phone codes on.
  const phone = typeof data?.phoneOtp?.enabled === 'boolean' ? data.phoneOtp.enabled
    : data?.phoneOtp?.supported === true ? true : undefined;
  if (phone === undefined || typeof data?.emailCode?.enabled !== 'boolean') {
    throw new Error('The server returned an unexpected sign-in configuration.');
  }
  return {
    phone,
    email: data.emailCode.enabled,
    codeLength: positive(data.emailCode.codeLength, AUTH_METHOD_DEFAULTS.codeLength),
    validForMs: positive(data.emailCode.validForMs, AUTH_METHOD_DEFAULTS.validForMs),
    resendCooldownMs: positive(data.emailCode.resendCooldownMs, AUTH_METHOD_DEFAULTS.resendCooldownMs),
  };
}

export function useAuthMethods(): AuthMethods & { retry: () => void } {
  const [state, setState] = useState<AuthMethods>(() => ({ status: 'loading', ...lastKnown(), ...AUTH_METHOD_DEFAULTS }));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setState(previous => ({ ...previous, status: 'loading' }));
    fetchAuthMethods().then(
      methods => {
        remember({ phone: methods.phone, email: methods.email });
        if (alive) setState({ status: 'ready', ...methods });
      },
      () => { if (alive) setState({ status: 'unavailable', ...lastKnown(), ...AUTH_METHOD_DEFAULTS }); },
    );
    return () => { alive = false; };
  }, [attempt]);

  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { ...state, retry };
}
