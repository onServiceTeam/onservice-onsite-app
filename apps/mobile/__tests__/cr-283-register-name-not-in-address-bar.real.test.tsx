// Customer review 2026-10-18, account-signin-9: on the website a new
// person's mobile number and name must not appear in the address bar or
// browser history. After "Continue" the code screen opens with no route
// params; number and name travel in memory (phone-signin store).
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockPush = jest.fn();
const mockRequestOtpWithCaptcha = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-router', () => {
  const ReactModule = jest.requireActual('react') as typeof React;
  return {
    useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
    Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) =>
      ReactModule.createElement('a', { href: String(href), ...props }, children),
  };
});
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: true }) }));
jest.mock('@/hooks/useCaptchaOtp', () => ({
  useCaptchaOtp: () => ({ requestOtpWithCaptcha: mockRequestOtpWithCaptcha, captchaModal: null }),
}));

import RegisterScreen from '../app/auth/register';
import { usePhoneSignInFlow } from '../src/stores/phone-signin.store';

it('Bug CR-283 — create account opens the code screen with no phone number or name in the route', async () => {
  usePhoneSignInFlow.getState().clear();
  render(<RegisterScreen />);

  fireEvent.change(screen.getByLabelText('First Name'), { target: { value: ' Maria ' } });
  fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Santos' } });
  fireEvent.change(screen.getByLabelText('Mobile Number'), { target: { value: '09171234567' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

  await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
  expect(mockPush).toHaveBeenCalledWith('/auth/otp-verify');
  expect(JSON.stringify(mockPush.mock.calls)).not.toMatch(/917|Maria|Santos|phone|firstName|lastName|params/);
  expect(usePhoneSignInFlow.getState()).toMatchObject({
    phone: '+639171234567', mode: 'register', firstName: 'Maria', lastName: 'Santos',
  });
});
