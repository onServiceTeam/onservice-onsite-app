import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockCreateTicket = jest.fn().mockResolvedValue({ id: 'ticket-892' });
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({
    projectId: '22222222-2222-4222-8222-22222222222A',
    projectTitle: 'Kitchen renovation plan',
    type: 'general_inquiry',
    subject: 'Help with Kitchen renovation plan',
    description: 'I need help understanding the next planning step.',
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

it('Bug UX-892 — the support form shows and submits the canonical planning project context', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><NewSupportRequestScreen /></QueryClientProvider>);

  expect(screen.getByText('Linked to project Kitchen renovation plan')).toBeTruthy();
  expect(screen.getByText(/remains separate from bookings, quotes, and payments/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Send to support' }));
  await waitFor(() => expect(mockCreateTicket).toHaveBeenCalledWith({
    type: 'general_inquiry',
    subject: 'Help with Kitchen renovation plan',
    description: 'I need help understanding the next planning step.',
    bookingId: undefined,
    projectId: '22222222-2222-4222-8222-22222222222a',
    priority: undefined,
  }));
  expect(mockReplace).toHaveBeenCalledWith('/support/ticket-892');
});
