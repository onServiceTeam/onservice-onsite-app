// Customer review 2026-10-18, account-signin-1 (app side): on "Create
// Account", a code the server could not send is reported on the same screen,
// inline under the number, instead of a toast that disappears; the code
// screen does not open.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ApiError } from '@/services/api';

const mockPush = jest.fn();
const mockShowToast = jest.fn();
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
jest.mock('@/lib/toast', () => ({ showToast: (...args: unknown[]) => mockShowToast(...args) }));

import RegisterScreen from '../app/auth/register';
import { usePhoneSignInFlow } from '../src/stores/phone-signin.store';

it('Bug CR-279 — create account shows the server\'s reason inline and stays on the number screen when the code was not sent', async () => {
  usePhoneSignInFlow.getState().clear();
  const reason = 'We could not send a code to this number. Please try again later.';
  mockRequestOtpWithCaptcha.mockRejectedValueOnce(
    new ApiError(502, { success: false, error: { message: reason, code: 'sms_not_sent' } } as never, 'Failed'),
  );
  render(<RegisterScreen />);

  fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Maria' } });
  fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Santos' } });
  fireEvent.change(screen.getByLabelText('Mobile Number'), { target: { value: '9171234567' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe(reason);
  expect(mockShowToast).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
  expect(usePhoneSignInFlow.getState().phone).toBeNull();

  // Changing the number clears the old reason.
  fireEvent.change(screen.getByLabelText('Mobile Number'), { target: { value: '9181234567' } });
  expect(screen.queryByRole('alert')).toBeNull();
});
