import { demoLogin, isDemoRole, resolveDemoConfig, type DemoConfig } from '@/config/demo';
import { useAuthStore } from '@/stores/auth.store';

const configuredDemo: DemoConfig = {
  enabled: true,
  accounts: { customer: '+639111111111', provider: '+639222222222' },
  otp: '135790',
};

describe('demo mode helper', () => {
  it('demoLogin("customer") signs in the configured customer', async () => {
    const { requestOtp, verifyOtp } = useAuthStore.getState();
    (requestOtp as jest.Mock).mockClear();
    (verifyOtp as jest.Mock).mockClear();

    await demoLogin('customer', configuredDemo);

    expect(requestOtp).toHaveBeenCalledWith(configuredDemo.accounts.customer);
    expect(verifyOtp).toHaveBeenCalledWith(configuredDemo.accounts.customer, configuredDemo.otp);
  });

  it('demoLogin("provider") signs in the configured provider', async () => {
    const { requestOtp, verifyOtp } = useAuthStore.getState();
    (requestOtp as jest.Mock).mockClear();
    (verifyOtp as jest.Mock).mockClear();

    await demoLogin('provider', configuredDemo);

    expect(requestOtp).toHaveBeenCalledWith(configuredDemo.accounts.provider);
    expect(verifyOtp).toHaveBeenCalledWith(configuredDemo.accounts.provider, configuredDemo.otp);
  });

  it('isDemoRole only accepts the two demo roles', () => {
    expect(isDemoRole('customer')).toBe(true);
    expect(isDemoRole('provider')).toBe(true);
    expect(isDemoRole('admin')).toBe(false);
    expect(isDemoRole(undefined)).toBe(false);
    expect(isDemoRole('')).toBe(false);
  });

  it('Bug SEC-068 — discards demo credentials when demo mode is disabled', () => {
    expect(
      resolveDemoConfig({
        mode: '0',
        customerPhone: '+639111111111',
        providerPhone: '+639222222222',
        otp: '135790',
      }),
    ).toEqual({ enabled: false, accounts: { customer: '', provider: '' }, otp: '' });
  });
});
