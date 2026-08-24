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
  useLocalSearchParams: () => ({ phone: '+639171234567', mode: 'login' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ isPhone: true }),
}));

import OTPVerifyScreen from '../app/auth/otp-verify';

it('Bug UX-247 — OTP resend uses the same captcha-aware request path as initial login', async () => {
  render(<OTPVerifyScreen />);

  fireEvent.click(screen.getByRole('button', { name: 'Resend Code' }));

  await waitFor(() => {
    expect(mockRequestOtpWithCaptcha).toHaveBeenCalledWith('+639171234567');
  });
});
