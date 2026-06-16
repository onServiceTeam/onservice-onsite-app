// Demo mode — one-tap, no-typing access to the customer + provider areas for
// UX testing and feedback.
//
// Gated on EXPO_PUBLIC_DEMO_MODE, which is set ONLY in the staging web build.
// Production builds don't set it, so the demo entry points are absent there and
// normal phone+OTP login is always the default. To "put the logins back", drop
// the flag from the build (or just share the plain URL — the demo entries only
// appear/trigger in a demo build).
import { useAuthStore } from '@/stores/auth.store';

export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === '1';

// Seeded test accounts (packages/api/seeds/002_test_users.sql) with realistic
// data so the UX screens render populated, not empty.
export const DEMO_ACCOUNTS: Record<'customer' | 'provider', string> = {
  customer: '+639171234567', // Maria (customer)
  provider: '+639221234567', // Roberto (provider)
};

export type DemoRole = keyof typeof DEMO_ACCOUNTS;

export function isDemoRole(value: unknown): value is DemoRole {
  return value === 'customer' || value === 'provider';
}

/**
 * Auto-authenticate as the seeded demo account for the given role via the
 * dev-OTP flow (code 000000, enabled on staging). Stores the session through
 * the auth store; the caller is responsible for routing afterward (or letting
 * the splash routing send the user to the role's home).
 */
export async function demoLogin(role: DemoRole): Promise<void> {
  const phone = DEMO_ACCOUNTS[role];
  const { requestOtp, verifyOtp } = useAuthStore.getState();
  await requestOtp(phone);
  await verifyOtp(phone, '000000');
}
