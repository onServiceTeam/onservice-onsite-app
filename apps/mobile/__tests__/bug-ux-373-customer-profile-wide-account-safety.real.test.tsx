import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockLogout = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
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
  useAuthStore: () => ({
    user: { id: 'customer-1', firstName: 'Ana', lastName: 'Cruz', phone: '+639171234567' },
    logout: mockLogout,
    setUser: jest.fn(),
  }),
}));

import ProfileScreen from '../app/(tabs)/profile';

it('Bug UX-373 — tablet customer profile separates identity and settings while phone changes use an honest support path', () => {
  render(<ProfileScreen />);

  expect(screen.getByLabelText('Wide customer profile workspace')).toBeTruthy();
  expect(screen.getByLabelText('Customer identity and contact details')).toBeTruthy();
  expect(screen.getByLabelText('Customer account settings')).toBeTruthy();
  expect(screen.getByText('Account settings')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Edit customer profile' }));
  expect(screen.getByLabelText('Verified mobile number')).toBeTruthy();
  expect(screen.getByText(/Phone changes are not available on this screen/i)).toBeTruthy();
  expect(screen.queryByText(/feature is in development/i)).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Contact support about changing the verified phone number' }));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/support/new',
    params: {
      type: 'account_issue',
      subject: 'Change my account phone number',
      description: 'I need help changing the verified phone number on my account.',
    },
  });

  fireEvent.click(screen.getByRole('button', { name: 'Log Out' }));
  expect(screen.getByRole('alert').textContent).toContain('You will need your verified mobile number to sign in again.');
});
