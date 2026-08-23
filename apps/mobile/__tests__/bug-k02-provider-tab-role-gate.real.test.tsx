import React from 'react';
import { cleanup, render } from '@testing-library/react';

let mockAuthState: { isAuthenticated: boolean; user: { role: string } | null } = {
  isAuthenticated: true,
  user: { role: 'customer' },
};

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));
jest.mock('@/components/provider/NewJobModal', () => () => <div data-testid="new-job-modal" />);
jest.mock('expo-router', () => {
  const ReactLib = require('react');
  const Tabs = ({ children }: { children?: React.ReactNode }) => ReactLib.createElement('div', { 'data-testid': 'provider-tabs' }, children);
  Tabs.Screen = () => null;
  return {
    Tabs,
    Redirect: ({ href }: { href: string }) => ReactLib.createElement('div', { 'data-testid': 'role-redirect', 'data-href': href }),
  };
});

import ProviderTabLayout from '../app/(provider-tabs)/_layout';

it('Bug CRIT-K02 — provider tabs render for providers while customer and anonymous sessions are redirected', () => {
  const customer = render(<ProviderTabLayout />);
  expect(customer.getByTestId('role-redirect').getAttribute('data-href')).toBe('/(tabs)/home');
  expect(customer.queryByTestId('provider-tabs')).toBeNull();
  cleanup();

  mockAuthState = { isAuthenticated: false, user: null };
  expect(render(<ProviderTabLayout />).getByTestId('role-redirect').getAttribute('data-href')).toBe('/auth/login');
  cleanup();

  mockAuthState = { isAuthenticated: true, user: { role: 'provider' } };
  const provider = render(<ProviderTabLayout />);
  expect(provider.getByTestId('provider-tabs')).toBeTruthy();
  expect(provider.getByTestId('new-job-modal')).toBeTruthy();
});
