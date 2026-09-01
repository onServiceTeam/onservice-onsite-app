import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({
    user: { id: 'customer-1', firstName: 'Ana', lastName: 'Cruz', phone: '+639171234567' },
    logout: jest.fn(), setUser: jest.fn(),
  }),
}));

import ProfileScreen from '../app/(tabs)/profile';

it('Bug UX-975 — the customer profile provides a named entry to the real company workspace route', () => {
  render(<ProfileScreen />);

  fireEvent.click(screen.getByRole('button', { name: 'Company Workspaces' }));
  expect(mockPush).toHaveBeenCalledWith('/customer/business');
});
