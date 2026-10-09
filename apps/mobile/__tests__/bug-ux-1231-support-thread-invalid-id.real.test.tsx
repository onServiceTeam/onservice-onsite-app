import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetMyTicket = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'not-a-support-case' }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: null }) => unknown) => selector({ user: null }),
}));
jest.mock('@/services/support.service', () => ({
  getMyTicket: (...args: unknown[]) => mockGetMyTicket(...args),
  addTicketMessage: jest.fn(),
  isTicketOpen: jest.fn(),
  getSupportStatusLabel: jest.fn(),
}));

import SupportThreadScreen from '../app/support/[id]';

it('Bug UX-1231 - a malformed mobile Support thread ID fails locally without an API request', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><SupportThreadScreen /></QueryClientProvider>);

  expect(screen.getByText('Support request unavailable')).toBeTruthy();
  expect(screen.getByText(/valid support request ID/i)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Return to Support' })).toBeTruthy();
  expect(mockGetMyTicket).not.toHaveBeenCalled();
});
