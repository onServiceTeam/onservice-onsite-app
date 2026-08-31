import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGet = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/services/api', () => ({ __esModule: true, default: { get: (...args: unknown[]) => mockGet(...args), post: jest.fn() } }));

import RecurringDetailScreen from '../app/customer/recurring/[id]';

it('Bug UX-634 — a recurring-service link without an ID fails explicitly instead of leaving an endless skeleton', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><RecurringDetailScreen /></QueryClientProvider>);

  expect(screen.getByText('Recurring booking unavailable')).toBeTruthy();
  expect(screen.getByText(/does not identify a recurring booking/i)).toBeTruthy();
  expect(mockGet).not.toHaveBeenCalled();
});
