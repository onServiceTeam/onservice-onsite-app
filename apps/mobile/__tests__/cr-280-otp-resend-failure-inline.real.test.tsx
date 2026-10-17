// Customer review 2026-10-18, account-signin-1 (app side): "Resend Code"
// never pretends a code went out. When the server refuses the resend, its
// reason shows inline under Resend on the code screen.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ApiError } from '@/services/api';

const mockRequestOtpWithCaptcha = jest.fn();
const mockShowToast = jest.fn();
jest.mock('@/hooks/useCaptchaOtp', () => ({
  useCaptchaOtp: () => ({ requestOtpWithCaptcha: mockRequestOtpWithCaptcha, captchaModal: null }),
}));
jest.mock('@/services/config.service', () => ({ getConfig: () => ({ otpCooldownSeconds: 0, otpLength: 6 }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: true }) }));
jest.mock('@/lib/toast', () => ({ showToast: (...args: unknown[]) => mockShowToast(...args) }));

import OTPVerifyScreen from '../app/auth/otp-verify';
import { usePhoneSignInFlow } from '../src/stores/phone-signin.store';

it('Bug CR-280 — a refused resend shows the server\'s reason inline on the code screen', async () => {
  const reason = 'We could not send a code to this number. Please try again later.';
  mockRequestOtpWithCaptcha.mockRejectedValueOnce(
    new ApiError(502, { success: false, error: { message: reason, code: 'sms_not_sent' } } as never, 'Failed'),
  );
  usePhoneSignInFlow.getState().start('+639171234567', 'login');
  render(<OTPVerifyScreen />);

  fireEvent.click(screen.getByRole('button', { name: 'Resend Code' }));

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe(reason);
  expect(mockRequestOtpWithCaptcha).toHaveBeenCalledWith('+639171234567');
  expect(mockShowToast).not.toHaveBeenCalled();
  // The countdown did not restart: nothing was sent, so Resend stays available.
  expect(screen.getByRole('button', { name: 'Resend Code' })).toBeTruthy();
});
