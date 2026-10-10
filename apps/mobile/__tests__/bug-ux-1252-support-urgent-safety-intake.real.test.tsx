import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockCreateTicket = jest.fn().mockResolvedValue({ id: '12520000-abcd-4abc-8def-000000001252' });
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({
    type: 'booking_issue',
    safetyConcern: '1',
    subject: 'Safety concern',
    description: 'I need help with a safety concern. ',
  }),
}));
jest.mock('@/services/support.service', () => ({
  createTicket: (...args: unknown[]) => mockCreateTicket(...args),
  SUPPORT_TYPE_LABELS: {
    general_inquiry: 'General question', booking_issue: 'Booking issue', payment_issue: 'Payment issue',
    provider_no_show: 'Provider no-show', app_bug: 'App problem', account_issue: 'Account issue',
  },
}));

import NewSupportRequestScreen from '../app/support/new';

it('Bug UX-1252 - urgent safety intake is visible, preserves urgent routing, and does not present Support as an emergency line', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><NewSupportRequestScreen /></QueryClientProvider>);

  expect(screen.getByRole('alert').textContent).toMatch(/urgent safety review requested/i);
  expect(screen.getByRole('alert').textContent).toMatch(/call 911 first/i);
  fireEvent.click(screen.getByRole('button', { name: 'Send to support' }));

  await waitFor(() => expect(mockCreateTicket).toHaveBeenCalledWith(expect.objectContaining({
    type: 'booking_issue',
    safetyConcern: true,
    subject: 'Safety concern',
  })));
});
