// Customer review 2026-10-18, account-signin-9: on the website the mobile
// number must not appear in the address bar or browser history. After "Send
// Verification Code" the code screen opens with no route params; the number
// travels in memory (phone-signin store), like the email flow.
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
jest.mock('@/config/demo', () => ({ DEMO_MODE: false, demoLogin: jest.fn() }));

import LoginScreen from '../app/auth/login';
import { usePhoneSignInFlow } from '../src/stores/phone-signin.store';

it('Bug CR-282 — log in opens the code screen with no phone number in the route', async () => {
  usePhoneSignInFlow.getState().clear();
  render(<LoginScreen />);

  fireEvent.change(screen.getByLabelText('Mobile Number'), { target: { value: '9171234567' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send Verification Code' }));

  await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
  expect(mockPush).toHaveBeenCalledWith('/auth/otp-verify');
  expect(JSON.stringify(mockPush.mock.calls)).not.toMatch(/917|phone|params/);
  expect(usePhoneSignInFlow.getState()).toMatchObject({ phone: '+639171234567', mode: 'login' });
});
