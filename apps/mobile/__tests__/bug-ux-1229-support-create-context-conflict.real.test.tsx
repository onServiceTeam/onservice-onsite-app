import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockCreateTicket = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({
    bookingId: '12290000-abcd-4abc-8def-000000001229',
    projectId: '12290000-abcd-4abc-8def-000000001230',
    subject: 'Conflicting context',
    description: 'This form must not be submitted.',
  }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/services/support.service', () => ({
  createTicket: (...args: unknown[]) => mockCreateTicket(...args),
  SUPPORT_TYPE_LABELS: {
    general_inquiry: 'General question', booking_issue: 'Booking issue', payment_issue: 'Payment issue',
    provider_no_show: 'Provider no-show', app_bug: 'App problem', account_issue: 'Account issue',
  },
}));

import NewSupportRequestScreen from '../app/support/new';

it('Bug UX-1229 - mobile Support creation rejects simultaneous booking and planning-project context before showing the form', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><NewSupportRequestScreen /></QueryClientProvider>);

  expect(screen.getByText('Support context unavailable')).toBeTruthy();
  expect(screen.getByText(/cannot also be linked to a booking or business account/i)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Return to related record' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Send to support' })).toBeNull();
  expect(mockCreateTicket).not.toHaveBeenCalled();
});
