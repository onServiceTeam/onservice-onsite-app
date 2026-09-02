import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

const mockPatch = jest.fn();
const mockSetUser = jest.fn();
const mockShowToast = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 390,
    breakpoint: 'phone',
    isPhone: true,
    isTablet: false,
    isDesktop: false,
  }),
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
    setUser: mockSetUser,
  }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { patch: mockPatch, get: jest.fn() },
}));
jest.mock('@/lib/toast', () => ({ showToast: mockShowToast }));

import ProfileScreen from '../app/(tabs)/profile';

it('Bug UX-1027 — saving an unchanged customer name closes edit mode without a false update request', () => {
  render(<ProfileScreen />);

  fireEvent.click(screen.getByRole('button', { name: 'Edit customer profile' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(mockPatch).not.toHaveBeenCalled();
  expect(mockSetUser).not.toHaveBeenCalled();
  expect(mockShowToast).toHaveBeenCalledWith('No profile changes to save.', 'info');
  expect(screen.getByRole('button', { name: 'Edit customer profile' })).toBeTruthy();
});
