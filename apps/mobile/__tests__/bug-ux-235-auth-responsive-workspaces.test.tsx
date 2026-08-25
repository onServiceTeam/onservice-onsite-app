import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('expo-router', () => {
  const ReactModule = require('react') as typeof React;
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    useLocalSearchParams: () => ({ phone: '+639171234567', mode: 'login' }),
    Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) =>
      ReactModule.createElement('a', { href, ...props }, children),
  };
});
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1366, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/hooks/useCaptchaOtp', () => ({
  useCaptchaOtp: () => ({ requestOtpWithCaptcha: jest.fn(), captchaModal: null }),
}));
jest.mock('@/config/demo', () => ({ DEMO_MODE: false, demoLogin: jest.fn() }));
jest.mock('@/stores/auth.store', () => {
  const state = {
    verifyOtp: jest.fn(),
    register: jest.fn(),
    requestOtp: jest.fn(),
    user: null,
  };
  const useAuthStore = (selector?: (value: typeof state) => unknown): unknown =>
    selector ? selector(state) : state;
  Object.assign(useAuthStore, { getState: () => state });
  return { useAuthStore };
});

import LoginScreen from '../app/auth/login';
import OTPVerifyScreen from '../app/auth/otp-verify';
import RegisterScreen from '../app/auth/register';

it('Bug UX-235 — login, registration, and OTP use bounded desktop workspaces', () => {
  const login = render(<LoginScreen />);
  expect(screen.getByLabelText('Desktop login workspace')).toBeTruthy();
  expect(screen.getByText('Return to every service record.')).toBeTruthy();
  expect(screen.getByText('Welcome back')).toBeTruthy();
  login.unmount();

  const registration = render(<RegisterScreen />);
  expect(screen.getByLabelText('Desktop registration workspace')).toBeTruthy();
  expect(screen.getByText('Start with a clear service record.')).toBeTruthy();
  expect(screen.getByText('Create Account')).toBeTruthy();
  registration.unmount();

  const otp = render(<OTPVerifyScreen />);
  expect(screen.getByLabelText('Desktop verification workspace')).toBeTruthy();
  expect(screen.getByText('Confirm the number tied to your records.')).toBeTruthy();
  expect(screen.getByText('Enter Verification Code')).toBeTruthy();
  otp.unmount();
});
