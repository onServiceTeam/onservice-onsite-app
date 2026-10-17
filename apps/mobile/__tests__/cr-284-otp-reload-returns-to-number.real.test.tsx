// Customer review 2026-10-18, account-signin-9: the code screen keeps no
// number in its address. Reloading it on the website empties the in-memory
// sign-in, so the screen sends the person back to the number screen (the same
// as the email code screen does).
import React from 'react';
import { render } from '@testing-library/react';

const mockReplace = jest.fn();
jest.mock('@/hooks/useCaptchaOtp', () => ({
  useCaptchaOtp: () => ({ requestOtpWithCaptcha: jest.fn(), captchaModal: null }),
}));
jest.mock('@/services/config.service', () => ({ getConfig: () => ({ otpCooldownSeconds: 60, otpLength: 6 }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  // Even a number left in an old link is ignored.
  useLocalSearchParams: () => ({ phone: '+639171234567', mode: 'login' }),
}));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: true }) }));

import OTPVerifyScreen from '../app/auth/otp-verify';
import { usePhoneSignInFlow } from '../src/stores/phone-signin.store';

it('Bug CR-284 — opening the code screen with no sign-in in memory returns to the number screen', () => {
  usePhoneSignInFlow.getState().clear();
  const { container } = render(<OTPVerifyScreen />);

  expect(mockReplace).toHaveBeenCalledWith('/auth/login');
  expect(container.textContent).not.toContain('917');
});
