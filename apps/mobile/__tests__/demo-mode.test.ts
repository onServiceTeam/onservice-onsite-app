// Demo mode — one-tap staging access for UX testing. demoLogin() auto-signs-in
// to a seeded account via the dev-OTP flow (code 000000) so testers reach the
// customer/provider areas without typing.

import { demoLogin, DEMO_ACCOUNTS, isDemoRole } from '@/config/demo';
import { useAuthStore } from '@/stores/auth.store';

describe('demo mode helper', () => {
  it('demoLogin("customer") signs in the seeded customer with dev OTP 000000', async () => {
    const { requestOtp, verifyOtp } = useAuthStore.getState();
    (requestOtp as jest.Mock).mockClear();
    (verifyOtp as jest.Mock).mockClear();

    await demoLogin('customer');

    expect(requestOtp).toHaveBeenCalledWith(DEMO_ACCOUNTS.customer);
    expect(verifyOtp).toHaveBeenCalledWith(DEMO_ACCOUNTS.customer, '000000');
    expect(DEMO_ACCOUNTS.customer).toBe('+639171234567');
  });

  it('demoLogin("provider") signs in the seeded provider', async () => {
    const { requestOtp, verifyOtp } = useAuthStore.getState();
    (requestOtp as jest.Mock).mockClear();
    (verifyOtp as jest.Mock).mockClear();

    await demoLogin('provider');

    expect(requestOtp).toHaveBeenCalledWith(DEMO_ACCOUNTS.provider);
    expect(verifyOtp).toHaveBeenCalledWith(DEMO_ACCOUNTS.provider, '000000');
    expect(DEMO_ACCOUNTS.provider).toBe('+639221234567');
  });

  it('isDemoRole only accepts the two demo roles', () => {
    expect(isDemoRole('customer')).toBe(true);
    expect(isDemoRole('provider')).toBe(true);
    expect(isDemoRole('admin')).toBe(false);
    expect(isDemoRole(undefined)).toBe(false);
    expect(isDemoRole('')).toBe(false);
  });
});
