import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Routes } from '@/config/navigation';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    user: { firstName: 'Ana', lastName: 'Santos', phone: '+639171234567', email: 'ana@example.test', role: 'provider' },
    logout: jest.fn(),
  }),
}));

import ProviderSettingsScreen from '../app/provider/settings';

it('Bug UX-237 — provider settings links a bounded workspace to durable notification preferences', () => {
  render(<ProviderSettingsScreen />);

  expect(screen.getByLabelText('Wide provider settings workspace')).toBeTruthy();
  expect(screen.queryByText('Push Notifications')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Notification Preferences/i }));
  expect(mockPush).toHaveBeenCalledWith(Routes.PROVIDER.NOTIFICATION_SETTINGS);
});
