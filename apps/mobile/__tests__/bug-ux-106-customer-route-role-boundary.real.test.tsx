import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let mockAuthState: { isAuthenticated: boolean; user: { role: string } | null } = {
  isAuthenticated: true,
  user: { role: 'provider' },
};

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));
jest.mock('expo-router', () => {
  const ReactLib = require('react');
  const Stack = ({ children }: { children?: React.ReactNode }) => ReactLib.createElement('div', { 'data-testid': 'customer-stack' }, children);
  Stack.Screen = () => null;
  const Tabs = ({ children }: { children?: React.ReactNode }) => ReactLib.createElement('div', { 'data-testid': 'customer-tabs' }, children);
  Tabs.Screen = () => null;
  return {
    Stack,
    Tabs,
    usePathname: () => '/home',
    Redirect: ({ href }: { href: string }) => ReactLib.createElement('div', { 'data-testid': 'role-redirect', 'data-href': href }),
  };
});

import CustomerLayout from '../app/customer/_layout';
import CustomerTabLayout from '../app/(tabs)/_layout';

// D38 Milestone 2: the tab layout reads the Bookings and Messages badge
// counts through react-query, so it renders inside a query client.
function Tabs(): React.ReactElement {
  return <QueryClientProvider client={new QueryClient()}><CustomerTabLayout /></QueryClientProvider>;
}

it('Bug UX-106 — customer standalone routes and tabs reject a provider session and render only for a customer', () => {
  const blockedStack = render(<CustomerLayout />);
  expect(blockedStack.getByTestId('role-redirect').getAttribute('data-href')).toBe('/(provider-tabs)/dashboard');
  expect(blockedStack.queryByTestId('customer-stack')).toBeNull();
  cleanup();

  const blockedTabs = render(<Tabs />);
  expect(blockedTabs.getByTestId('role-redirect').getAttribute('data-href')).toBe('/(provider-tabs)/dashboard');
  expect(blockedTabs.queryByTestId('customer-tabs')).toBeNull();
  cleanup();

  mockAuthState = { isAuthenticated: true, user: { role: 'customer' } };
  expect(render(<CustomerLayout />).getByTestId('customer-stack')).toBeTruthy();
  cleanup();
  expect(render(<Tabs />).getByTestId('customer-tabs')).toBeTruthy();
});
