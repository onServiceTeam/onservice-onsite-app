// Customer review 2026-10-18, account-signin-1 (app side): sign-in never says
// "code sent" when nothing was sent. When the server refuses to send the code
// (for example the text could not be sent), the number screen shows the
// server's own reason inline and the code screen does not open.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@/services/api';

const mockPush = jest.fn();
const mockRequestOtpWithCaptcha = jest.fn();
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

it('Bug CR-278 — log in shows the server\'s reason inline and stays on the number screen when the code was not sent', async () => {
  usePhoneSignInFlow.getState().clear();
  const reason = 'We could not send a code to this number. Please try again later.';
  mockRequestOtpWithCaptcha.mockRejectedValueOnce(
    new ApiError(502, { success: false, error: { message: reason, code: 'sms_not_sent' } } as never, 'Failed'),
  );
  render(<LoginScreen />);

  fireEvent.change(screen.getByLabelText('Mobile Number'), { target: { value: '9171234567' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send Verification Code' }));

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe(reason);
  expect(mockRequestOtpWithCaptcha).toHaveBeenCalledWith('+639171234567');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send Verification Code' })).toBeTruthy());
  expect(mockPush).not.toHaveBeenCalled();
  expect(usePhoneSignInFlow.getState().phone).toBeNull();
});
