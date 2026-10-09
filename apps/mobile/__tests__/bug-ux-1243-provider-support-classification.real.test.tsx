import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({
    bookingId: '12430000-abcd-4abc-8def-000000001243',
  }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) =>
    selector({ user: { role: 'provider' } }),
}));

import NewSupportRequestScreen from '../app/support/new';

it('Bug UX-1243 - provider Support intake excludes the customer-facing provider no-show classification', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><NewSupportRequestScreen /></QueryClientProvider>);

  expect(screen.getByText('Booking issue')).toBeTruthy();
  expect(screen.queryByText('Provider no-show')).toBeNull();
});
