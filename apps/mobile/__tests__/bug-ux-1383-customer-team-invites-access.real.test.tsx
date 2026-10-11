import React from 'react';
import { cleanup, render } from '@testing-library/react';

let mockAuthState: { isAuthenticated: boolean; user: { role: string } | null } = {
  isAuthenticated: true,
  user: { role: 'customer' },
};
let mockSegments: string[] = ['staff', 'invites'];

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));
jest.mock('expo-router', () => {
  const ReactLib = require('react');
  const Stack = () => ReactLib.createElement('div', { 'data-testid': 'staff-stack' });
  Stack.Screen = () => null;
  return {
    Stack,
    useSegments: () => mockSegments,
    Redirect: ({ href }: { href: string }) => ReactLib.createElement('div', { 'data-testid': 'role-redirect', 'data-href': href }),
  };
});

import StaffLayout from '../app/staff/_layout';

afterEach(cleanup);

it('Bug UX-1383 — a customer invited to a team can open Team Invitations but no staff job screen', () => {
  // Profile and the web menu link customers to /staff/invites; accepting is
  // what turns them into staff, so the screen must render for a customer.
  const invites = render(<StaffLayout />);
  expect(invites.getByTestId('staff-stack')).toBeTruthy();
  expect(invites.queryByTestId('role-redirect')).toBeNull();
  cleanup();

  for (const screen of [['staff', 'jobs'], ['staff', 'job', '[id]'], ['staff', 'job', '[id]', 'checklist']]) {
    mockSegments = screen;
    const job = render(<StaffLayout />);
    expect({ screen, href: job.getByTestId('role-redirect').getAttribute('data-href') })
      .toEqual({ screen, href: '/(tabs)/home' });
    expect(job.queryByTestId('staff-stack')).toBeNull();
    cleanup();
  }

  // Providers and signed-out visitors still cannot open invitations here.
  mockSegments = ['staff', 'invites'];
  mockAuthState = { isAuthenticated: true, user: { role: 'provider' } };
  expect(render(<StaffLayout />).getByTestId('role-redirect').getAttribute('data-href')).toBe('/(provider-tabs)/dashboard');
  cleanup();
  mockAuthState = { isAuthenticated: false, user: null };
  expect(render(<StaffLayout />).getByTestId('role-redirect').getAttribute('data-href')).toBe('/auth/login');
});
