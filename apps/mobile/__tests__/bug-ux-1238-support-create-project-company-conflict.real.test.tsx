import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockCreateTicket = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({
    projectId: '12380000-abcd-4abc-8def-000000001238',
    businessAccountId: '12380000-abcd-4abc-8def-000000001239',
  }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/support.service', () => ({
  createTicket: (...args: unknown[]) => mockCreateTicket(...args),
  SUPPORT_TYPE_LABELS: {
    general_inquiry: 'General question', booking_issue: 'Booking issue', payment_issue: 'Payment issue',
    provider_no_show: 'Provider no-show', app_bug: 'App problem', account_issue: 'Account issue',
  },
}));

import NewSupportRequestScreen from '../app/support/new';

it('Bug UX-1238 - Support creation rejects combined planning-project and Business Account context', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><NewSupportRequestScreen /></QueryClientProvider>);

  expect(screen.getByText(/planning-project support request cannot also be linked/i)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Send to support' })).toBeNull();
  expect(mockCreateTicket).not.toHaveBeenCalled();
});
