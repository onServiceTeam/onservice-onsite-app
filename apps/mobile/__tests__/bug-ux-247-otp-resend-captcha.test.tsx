import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockRequestOtpWithCaptcha = jest.fn().mockResolvedValue(undefined);
jest.mock('@/hooks/useCaptchaOtp', () => ({
  useCaptchaOtp: () => ({
    requestOtpWithCaptcha: mockRequestOtpWithCaptcha,
    captchaModal: null,
  }),
}));
jest.mock('@/stores/auth.store', () => {
  const state = {
    verifyOtp: jest.fn(),
    register: jest.fn(),
    user: null,
  };
  const useAuthStore = (selector?: (value: typeof state) => unknown) => (
    selector ? selector(state) : state
  );
  useAuthStore.getState = () => state;
  return { useAuthStore };
});
jest.mock('@/services/config.service', () => ({
  getConfig: () => ({ otpCooldownSeconds: 0, otpLength: 6 }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ isPhone: true }),
}));

import OTPVerifyScreen from '../app/auth/otp-verify';
import { usePhoneSignInFlow } from '../src/stores/phone-signin.store';

it('Bug UX-247 — OTP resend uses the same captcha-aware request path as initial login', async () => {
  // The number travels in memory (phone-signin store), not in route params
  // (account-signin-9, 2026-10-18), so the test seeds the store.
  usePhoneSignInFlow.getState().start('+639171234567', 'login');
  render(<OTPVerifyScreen />);

  fireEvent.click(screen.getByRole('button', { name: 'Resend Code' }));

  await waitFor(() => {
    expect(mockRequestOtpWithCaptcha).toHaveBeenCalledWith('+639171234567');
  });
});
