import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

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
    setUser: jest.fn(),
  }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { patch: jest.fn(), get: jest.fn() },
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

import ProfileScreen from '../app/(tabs)/profile';
import api from '@/services/api';
import { showToast } from '@/lib/toast';

it('Bug UX-1027 — saving an unchanged customer name closes edit mode without a false update request', () => {
  render(<ProfileScreen />);

  fireEvent.click(screen.getByRole('button', { name: 'Edit customer profile' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(api.patch).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledWith('No profile changes to save.', 'info');
  expect(screen.getByRole('button', { name: 'Edit customer profile' })).toBeTruthy();
});
