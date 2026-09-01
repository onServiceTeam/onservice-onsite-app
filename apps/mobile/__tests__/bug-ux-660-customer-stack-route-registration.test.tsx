import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    isAuthenticated: true,
    user: { role: 'customer' },
  }),
}));
jest.mock('expo-router', () => {
  const ReactLib = require('react');
  const Stack = ({ children }: { children?: React.ReactNode }) => ReactLib.createElement('div', {}, children);
  Stack.Screen = ({ name }: { name: string }) => ReactLib.createElement('div', { 'data-testid': `route-${name}` });
  return { Stack, Redirect: () => null };
});

import CustomerLayout from '../app/customer/_layout';

it('Bug UX-660 — the customer stack explicitly registers every previously implicit planning, recurring, settings, and payment route', () => {
  render(<CustomerLayout />);

  for (const name of [
    'booking/configure',
    'booking/make-recurring',
    'booking/pay',
    'booking/payment-failed',
    'notification-settings',
    'payment-methods',
    'recurring/index',
    'recurring/[id]',
    'projects/index',
    'projects/new',
    'projects/[id]',
    'business/index',
    'business/[id]/index',
    'business/[id]/invoices/[invoiceId]',
  ]) {
    expect(screen.getByTestId(`route-${name}`)).toBeTruthy();
  }
});
