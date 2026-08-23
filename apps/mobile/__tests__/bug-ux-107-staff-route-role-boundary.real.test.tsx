import React from 'react';
import { cleanup, render } from '@testing-library/react';

let mockAuthState: { isAuthenticated: boolean; user: { role: string } | null } = {
  isAuthenticated: true,
  user: { role: 'customer' },
};

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));
jest.mock('expo-router', () => {
  const ReactLib = require('react');
  const Stack = () => ReactLib.createElement('div', { 'data-testid': 'staff-stack' });
  Stack.Screen = () => null;
  return {
    Stack,
    Redirect: ({ href }: { href: string }) => ReactLib.createElement('div', { 'data-testid': 'role-redirect', 'data-href': href }),
  };
});

import StaffLayout from '../app/staff/_layout';

it('Bug UX-107 — staff routes have a registered provider-staff boundary instead of relying on API rejection', () => {
  const customer = render(<StaffLayout />);
  expect(customer.getByTestId('role-redirect').getAttribute('data-href')).toBe('/(tabs)/home');
  expect(customer.queryByTestId('staff-stack')).toBeNull();
  cleanup();

  mockAuthState = { isAuthenticated: true, user: { role: 'provider_staff' } };
  const staff = render(<StaffLayout />);
  expect(staff.getByTestId('staff-stack')).toBeTruthy();
  expect(staff.queryByTestId('role-redirect')).toBeNull();
});
