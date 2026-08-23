import React from 'react';
import { cleanup, render } from '@testing-library/react';

let mockAuthState: { isAuthenticated: boolean; user: { role: string } | null } = {
  isAuthenticated: false,
  user: null,
};

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));
jest.mock('expo-router', () => {
  const ReactLib = require('react');
  const Stack = () => ReactLib.createElement('div', { 'data-testid': 'support-stack' });
  Stack.Screen = () => null;
  return {
    Stack,
    Redirect: ({ href }: { href: string }) => ReactLib.createElement('div', { 'data-testid': 'role-redirect', 'data-href': href }),
  };
});

import SupportLayout from '../app/support/_layout';

it('Bug UX-108 — shared support requires authentication and still renders for each supported app persona', () => {
  expect(render(<SupportLayout />).getByTestId('role-redirect').getAttribute('data-href')).toBe('/auth/login');
  cleanup();

  for (const role of ['customer', 'provider', 'provider_staff']) {
    mockAuthState = { isAuthenticated: true, user: { role } };
    const allowed = render(<SupportLayout />);
    expect(allowed.getByTestId('support-stack')).toBeTruthy();
    expect(allowed.queryByTestId('role-redirect')).toBeNull();
    cleanup();
  }
});
