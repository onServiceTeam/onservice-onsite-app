import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetMyTicket = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: { user: null }) => unknown) => selector({ user: null }) }));
jest.mock('@/services/support.service', () => ({
  getMyTicket: (...args: unknown[]) => mockGetMyTicket(...args),
  addTicketMessage: jest.fn(),
  isTicketOpen: jest.fn(),
  SUPPORT_STATUS_LABELS: {},
}));

import SupportThreadScreen from '../app/support/[id]';

it('Bug UX-631 — a support-thread link without a ticket ID fails explicitly instead of showing an endless loader', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><SupportThreadScreen /></QueryClientProvider>);

  expect(screen.getByText('Support request unavailable')).toBeTruthy();
  expect(screen.getByText(/does not contain a valid support request ID/i)).toBeTruthy();
  expect(mockGetMyTicket).not.toHaveBeenCalled();
});
