import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockCreateTicket = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({
    bookingId: 'not-a-booking',
    subject: 'Malformed context',
    description: 'This form must not be submitted.',
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

it('Bug UX-1230 - mobile Support creation rejects malformed linked-work IDs before showing the form', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><NewSupportRequestScreen /></QueryClientProvider>);

  expect(screen.getByText('Support context unavailable')).toBeTruthy();
  expect(screen.getByText(/invalid booking or project/i)).toBeTruthy();
  expect(screen.queryByLabelText('Subject')).toBeNull();
  expect(mockCreateTicket).not.toHaveBeenCalled();
});
