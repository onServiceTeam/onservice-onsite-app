import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockCreateTicket = jest.fn().mockResolvedValue({ id: '12340000-abcd-4abc-8def-000000001234' });
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({
    businessAccountId: '12340000-ABCD-4ABC-8DEF-000000001235',
    businessName: 'Cebu Build Co',
    type: 'general_inquiry',
    subject: 'Help with Cebu Build Co',
    description: 'Please help our team with this company account.',
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

it('Bug UX-1234 - customer Support creation displays and submits canonical Business Account context', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><NewSupportRequestScreen /></QueryClientProvider>);

  expect(screen.getByText('Linked to company Cebu Build Co')).toBeTruthy();
  expect(screen.getByText(/request will stay in your Support inbox/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Send to support' }));
  await waitFor(() => expect(mockCreateTicket).toHaveBeenCalledWith({
    type: 'general_inquiry',
    subject: 'Help with Cebu Build Co',
    description: 'Please help our team with this company account.',
    bookingId: undefined,
    projectId: undefined,
    businessAccountId: '12340000-abcd-4abc-8def-000000001235',
  }));
  expect(mockReplace).toHaveBeenCalledWith('/support/12340000-abcd-4abc-8def-000000001234');
});
