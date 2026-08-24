// Demo mode — one-tap, no-typing access to the customer + provider areas for
// UX testing and feedback.
//
// Gated on EXPO_PUBLIC_DEMO_MODE, which is set ONLY in a protected demo build.
// The account phones and OTP are build-time inputs too, so public bundles do
// not carry reusable test credentials when demo mode is off.
import { useAuthStore } from '@/stores/auth.store';

type DemoBuildEnvironment = {
  mode?: string;
  customerPhone?: string;
  providerPhone?: string;
  otp?: string;
};

export type DemoConfig = {
  enabled: boolean;
  accounts: Record<'customer' | 'provider', string>;
  otp: string;
};

const PH_MOBILE_PATTERN = /^\+639\d{9}$/;
const OTP_PATTERN = /^\d{6}$/;

export function resolveDemoConfig(environment: DemoBuildEnvironment): DemoConfig {
  if (environment.mode !== '1') {
    return { enabled: false, accounts: { customer: '', provider: '' }, otp: '' };
  }

  const customer = environment.customerPhone?.trim() ?? '';
  const provider = environment.providerPhone?.trim() ?? '';
  const otp = environment.otp?.trim() ?? '';
  if (!PH_MOBILE_PATTERN.test(customer) || !PH_MOBILE_PATTERN.test(provider) || !OTP_PATTERN.test(otp)) {
    throw new Error(
      'Demo mode requires valid EXPO_PUBLIC_DEMO_CUSTOMER_PHONE, ' +
        'EXPO_PUBLIC_DEMO_PROVIDER_PHONE, and EXPO_PUBLIC_DEMO_OTP values.',
    );
  }

  return { enabled: true, accounts: { customer, provider }, otp };
}

const demoConfig = resolveDemoConfig({
  mode: process.env.EXPO_PUBLIC_DEMO_MODE,
  customerPhone: process.env.EXPO_PUBLIC_DEMO_CUSTOMER_PHONE,
  providerPhone: process.env.EXPO_PUBLIC_DEMO_PROVIDER_PHONE,
  otp: process.env.EXPO_PUBLIC_DEMO_OTP,
});

export const DEMO_MODE = demoConfig.enabled;

export const DEMO_ACCOUNTS = demoConfig.accounts;

export type DemoRole = keyof typeof DEMO_ACCOUNTS;

export function isDemoRole(value: unknown): value is DemoRole {
  return value === 'customer' || value === 'provider';
}

/**
 * Auto-authenticate as a configured demo account. Stores the session through
 * the auth store; the caller is responsible for routing afterward.
 */
export async function demoLogin(role: DemoRole, config: DemoConfig = demoConfig): Promise<void> {
  if (!config.enabled) throw new Error('Demo access is not configured for this build.');
  const phone = config.accounts[role];
  const { requestOtp, verifyOtp } = useAuthStore.getState();
  await requestOtp(phone);
  await verifyOtp(phone, config.otp);
}
