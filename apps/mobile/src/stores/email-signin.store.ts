import { create } from 'zustand';

/**
 * D37: carries an email sign-in between its screens IN MEMORY only, so the
 * address and the one-time sign-up pass never appear in a web address bar or
 * browser history (expo-router params do). Reloading the web page clears it
 * and the screens send the person back to the start.
 *
 * Times are this device's clock at the moment the server answered, plus the
 * server's own remaining milliseconds, so a wrong phone clock cannot shorten
 * or lengthen the five-minute window.
 */

interface ServerTiming { expiresInMs: number; resendInMs: number; delivery?: 'accepted' | 'unknown' }

interface EmailSignInFlow {
  email: string | null;
  mode: 'login' | 'register';
  /** Device time (ms) when the current code stops working. */
  expiresAt: number;
  /** Device time (ms) when "Resend" becomes available. */
  resendAt: number;
  signupToken: string | null;
  signupExpiresAt: number;
  /** The provider did not confirm the last send (it may still arrive). */
  deliveryUncertain: boolean;
  /** The code screen was opened for a code sent earlier (e.g. after Back). */
  alreadySent: boolean;
  start: (email: string, mode: 'login' | 'register', timing: ServerTiming, options?: { alreadySent?: boolean }) => void;
  /** After a resend (same code, same expiry) or a fresh code. */
  update: (timing: ServerTiming) => void;
  needsAccount: (signupToken: string, expiresInSeconds: number) => void;
  clear: () => void;
}

const empty = { email: null, mode: 'login' as const, expiresAt: 0, resendAt: 0, signupToken: null, signupExpiresAt: 0,
  deliveryUncertain: false, alreadySent: false };

export const useEmailSignInFlow = create<EmailSignInFlow>(set => ({
  ...empty,
  start: (email, mode, timing, options) => {
    const now = Date.now();
    set({ ...empty, email, mode, expiresAt: now + timing.expiresInMs, resendAt: now + timing.resendInMs,
      deliveryUncertain: timing.delivery === 'unknown', alreadySent: options?.alreadySent === true });
  },
  update: timing => {
    const now = Date.now();
    set({ expiresAt: now + timing.expiresInMs, resendAt: now + timing.resendInMs,
      deliveryUncertain: timing.delivery === 'unknown', alreadySent: false });
  },
  needsAccount: (signupToken, expiresInSeconds) => {
    set({ signupToken, signupExpiresAt: Date.now() + expiresInSeconds * 1000 });
  },
  clear: () => set({ ...empty }),
}));
