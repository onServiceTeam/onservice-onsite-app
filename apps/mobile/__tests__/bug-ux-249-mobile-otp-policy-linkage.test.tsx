import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('@/services/config.service', () => ({
  getConfig: () => ({ otpCooldownSeconds: 45, otpLength: 8 }),
}));
jest.mock('@/hooks/useCaptchaOtp', () => ({
  useCaptchaOtp: () => ({ requestOtpWithCaptcha: jest.fn(), captchaModal: null }),
}));
jest.mock('@/stores/auth.store', () => {
  const state = { verifyOtp: jest.fn(), register: jest.fn(), user: null };
  const useAuthStore = (selector?: (value: typeof state) => unknown) => (
    selector ? selector(state) : state
  );
  useAuthStore.getState = () => state;
  return { useAuthStore };
});
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useLocalSearchParams: () => ({ phone: '+639171234567', mode: 'login' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ isPhone: false }),
}));

import OTPVerifyScreen from '../app/auth/otp-verify';

it('Bug UX-249 — mobile verification renders the admin-published OTP length instead of a six-digit constant', () => {
  render(<OTPVerifyScreen />);

  expect(screen.getByText(/verification code with 8 digits/)).toBeTruthy();
  expect(screen.getByLabelText('Enter 8-digit code')).toBeTruthy();
  expect(screen.getByText('Resend in 45s')).toBeTruthy();
});
