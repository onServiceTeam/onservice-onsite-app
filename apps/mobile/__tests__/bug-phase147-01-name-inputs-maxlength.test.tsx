import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('expo-router', () => {
  const ReactModule = require('react') as typeof React;
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) =>
      ReactModule.createElement('a', { href, ...props }, children),
  };
});

jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 1366,
    breakpoint: 'desktop',
    isPhone: false,
    isTablet: false,
    isDesktop: true,
  }),
}));
jest.mock('@/hooks/useCaptchaOtp', () => ({
  useCaptchaOtp: () => ({ requestOtpWithCaptcha: jest.fn(), captchaModal: null }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({
    user: {
      id: 'customer-1',
      firstName: 'Ana',
      lastName: 'Cruz',
      phone: '+639171234567',
      role: 'customer',
    },
    logout: jest.fn(),
    setUser: jest.fn(),
  }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { patch: jest.fn(), get: jest.fn() },
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

import RegisterScreen from '../app/auth/register';
import ProfileScreen from '../app/(tabs)/profile';

describe('BUG-PHASE147-01 - First/Last Name inputs enforce server max(100)', () => {
  it('renders capped name fields in registration and customer profile editing', () => {
    const registration = render(<RegisterScreen />);
    expect((screen.getByLabelText('First Name') as HTMLInputElement).maxLength).toBe(100);
    expect((screen.getByLabelText('Last Name') as HTMLInputElement).maxLength).toBe(100);
    registration.unmount();

    render(<ProfileScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit customer profile' }));
    expect((screen.getByLabelText('First Name') as HTMLInputElement).maxLength).toBe(100);
    expect((screen.getByLabelText('Last Name') as HTMLInputElement).maxLength).toBe(100);
  });
});
