// Customer review 2026-10-18, account-signin-9: the code screen signs the
// person in with the number and name held in memory (not route params), and
// forgets them once signed in. A new account gets the name typed on "Create
// Account".
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockReplace = jest.fn();
const mockVerifyOtp = jest.fn().mockResolvedValue(undefined);
const mockRegister = jest.fn().mockResolvedValue(undefined);
jest.mock('@/hooks/useCaptchaOtp', () => ({
  useCaptchaOtp: () => ({ requestOtpWithCaptcha: jest.fn(), captchaModal: null }),
}));
jest.mock('@/services/config.service', () => ({ getConfig: () => ({ otpCooldownSeconds: 60, otpLength: 6 }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: true }) }));
jest.mock('@/stores/auth.store', () => {
  const state = { verifyOtp: (...a: unknown[]) => mockVerifyOtp(...a), register: (...a: unknown[]) => mockRegister(...a), user: null };
  const useAuthStore = (selector?: (value: typeof state) => unknown) => (selector ? selector(state) : state);
  useAuthStore.getState = () => state;
  return { useAuthStore };
});

import OTPVerifyScreen from '../app/auth/otp-verify';
import { usePhoneSignInFlow } from '../src/stores/phone-signin.store';

it('Bug CR-285 — the code screen signs in with the number and name held in memory, then forgets them', async () => {
  usePhoneSignInFlow.getState().start('+639171234567', 'register', { firstName: 'Maria', lastName: 'Santos' });
  render(<OTPVerifyScreen />);

  expect(screen.getByText('+63 917 123 4567')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Enter 6-digit code'), { target: { value: '123456' } });

  await waitFor(() => expect(mockRegister).toHaveBeenCalledWith('+639171234567', 'Maria', 'Santos'));
  expect(mockVerifyOtp).toHaveBeenCalledWith('+639171234567', '123456');
  await waitFor(() => expect(usePhoneSignInFlow.getState().phone).toBeNull());
  expect(mockReplace).toHaveBeenCalledWith('/provider-onboarding/role-select');
  // Forgetting the sign-in after success does not also bounce to the number screen.
  expect(mockReplace).not.toHaveBeenCalledWith('/auth/login');
});
