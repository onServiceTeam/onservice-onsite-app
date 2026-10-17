// Customer review 2026-10-18, D41 Q47 option (a): while onService is open to
// invited testers only, the server refuses other numbers with a message set in
// admin. A new person on "Create Account" sees that message as written, on
// the number screen, and no code screen opens.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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

import RegisterScreen from '../app/auth/register';

it('Bug CR-281 — a new number refused while onService is for invited testers shows the admin\'s message on the number screen', async () => {
  // An admin-edited wording, to show the screen does not use its own copy.
  const adminMessage = 'Only invited testers can sign in to onService for now.';
  mockRequestOtpWithCaptcha.mockRejectedValueOnce(
    new ApiError(403, { success: false, error: { message: adminMessage, code: 'invited_testers_only' } } as never, 'Forbidden'),
  );
  render(<RegisterScreen />);

  fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Juan' } });
  fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'dela Cruz' } });
  fireEvent.change(screen.getByLabelText('Mobile Number'), { target: { value: '9998887777' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

  expect((await screen.findByRole('alert')).textContent).toBe(adminMessage);
  expect(screen.getByText(adminMessage)).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
});
