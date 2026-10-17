import { create } from 'zustand';

/**
 * Carries a phone sign-in from the number screen to the code screen IN MEMORY
 * only, so the mobile number and the person's name never appear in a web
 * address bar or browser history (expo-router params do). Same pattern as the
 * email flow (email-signin.store.ts). Reloading the web page clears it, and
 * the code screen then sends the person back to the number screen.
 */

export type PhoneSignInMode = 'login' | 'register';

interface PhoneSignInNames {
  firstName: string;
  lastName: string;
}

interface PhoneSignInFlow {
  /** +63 number the code was sent to, or null when no sign-in is under way. */
  phone: string | null;
  mode: PhoneSignInMode;
  /** Only set for a new account ("Create Account"). */
  firstName: string | null;
  lastName: string | null;
  start: (phone: string, mode: PhoneSignInMode, names?: PhoneSignInNames) => void;
  clear: () => void;
}

const empty = { phone: null, mode: 'login' as const, firstName: null, lastName: null };

export const usePhoneSignInFlow = create<PhoneSignInFlow>(set => ({
  ...empty,
  start: (phone, mode, names) => {
    set({
      ...empty,
      phone,
      mode,
      firstName: names?.firstName ?? null,
      lastName: names?.lastName ?? null,
    });
  },
  clear: () => set({ ...empty }),
}));
