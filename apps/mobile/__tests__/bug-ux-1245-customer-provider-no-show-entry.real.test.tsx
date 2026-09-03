import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({
    bookingId: '12450000-abcd-4abc-8def-000000001245',
    type: 'provider_no_show',
  }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) =>
    selector({ user: { role: 'customer' } }),
}));

import NewSupportRequestScreen from '../app/support/new';

it('Bug UX-1245 - a customer booking can open the provider no-show support classification', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><NewSupportRequestScreen /></QueryClientProvider>);

  expect(screen.getByText('Linked to booking 12450000')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Provider no-show' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.queryByRole('alert')).toBeNull();
});
