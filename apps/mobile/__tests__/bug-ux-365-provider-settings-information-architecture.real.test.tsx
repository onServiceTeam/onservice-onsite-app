import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args), replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 820,
    breakpoint: 'tablet',
    isPhone: false,
    isTablet: true,
    isDesktop: false,
  }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    user: {
      firstName: 'Ana',
      lastName: 'Santos',
      phone: '+639171234567',
      email: 'ana@example.test',
      role: 'provider',
    },
    logout: jest.fn(),
  }),
}));

import ProviderSettingsScreen from '../app/provider/settings';

it('Bug UX-365 — tablet provider settings separates account communication from business and payout controls', () => {
  render(<ProviderSettingsScreen />);

  expect(screen.getByLabelText('Tablet and desktop provider settings columns')).toBeTruthy();
  expect(screen.getByText('ACCOUNT')).toBeTruthy();
  expect(screen.getByText('NOTIFICATIONS')).toBeTruthy();
  expect(screen.getByText('BUSINESS & PAYOUTS')).toBeTruthy();
  expect(screen.queryByText('PROFILE')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: /Payout History/i }));
  expect(mockPush).toHaveBeenCalledWith('/provider/payouts');
  fireEvent.click(screen.getByRole('button', { name: /Withdrawal Preferences/i }));
  expect(mockPush).toHaveBeenCalledWith('/provider/payout-settings');
});
