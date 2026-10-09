import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ type: 'provider_no_show' }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) =>
    selector({ user: { role: 'customer' } }),
}));

import NewSupportRequestScreen from '../app/support/new';

it('Bug UX-1244 - customer provider no-show intake requires the affected booking context', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><NewSupportRequestScreen /></QueryClientProvider>);

  expect(screen.getByRole('alert').textContent).toMatch(/must be opened from the affected booking/i);
  expect(screen.queryByText('Provider no-show')).toBeNull();
  expect((screen.getByRole('button', { name: 'Send to support' }) as HTMLButtonElement).disabled).toBe(true);
});
