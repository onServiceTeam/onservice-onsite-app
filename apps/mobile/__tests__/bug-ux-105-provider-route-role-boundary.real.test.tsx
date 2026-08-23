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
  const Stack = ({ children }: { children?: React.ReactNode }) => ReactLib.createElement('div', { 'data-testid': 'provider-stack' }, children);
  Stack.Screen = () => null;
  return {
    Stack,
    Redirect: ({ href }: { href: string }) => ReactLib.createElement('div', { 'data-testid': 'role-redirect', 'data-href': href }),
  };
});

import ProviderLayout from '../app/provider/_layout';

it('Bug UX-105 — provider standalone routes reject a customer session and render only for a provider', () => {
  const blocked = render(<ProviderLayout />);
  expect(blocked.getByTestId('role-redirect').getAttribute('data-href')).toBe('/(tabs)/home');
  expect(blocked.queryByTestId('provider-stack')).toBeNull();
  cleanup();

  mockAuthState = { isAuthenticated: true, user: { role: 'provider' } };
  const allowed = render(<ProviderLayout />);
  expect(allowed.getByTestId('provider-stack')).toBeTruthy();
  expect(allowed.queryByTestId('role-redirect')).toBeNull();
});
