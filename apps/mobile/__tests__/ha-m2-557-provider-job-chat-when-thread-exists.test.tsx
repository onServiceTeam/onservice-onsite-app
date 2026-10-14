// HA-M2-557 (D38 Milestone 2, package P5b): the provider's job screen offers
// the chat whenever this pro's thread with the customer exists (a request
// thread opens with the quote), for example while the customer still has to
// pay, not only once the job is under way. Without a thread there is no chat
// entry before the job starts.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ok, providerRequestFixture, quoteFixture, routeGets } from '../test-support/request-fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/hooks/useLocation', () => ({ useLocation: () => ({ getCurrentLocation: jest.fn(), isLoading: false }) }));
jest.mock('@/services/provider-api.service', () => ({ updateBookingStatus: jest.fn() }));
jest.mock('@/services/booking-proof.service', () => ({ getBookingProofSummary: jest.fn().mockResolvedValue(null) }));
jest.mock('@/services/booking.service', () => ({
  getMyDisputes: jest.fn().mockResolvedValue({ disputes: [] }),
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-req-1', bookingType: 'quote_based', status: 'payment_pending', servicePrice: 180000,
    description: 'Bedroom aircon blows warm air.', address: '88 Banilad Road', barangay: 'Banilad', city: 'Cebu City',
    latitude: 10.33, longitude: 123.91, scheduledAt: '2026-10-15T00:00:00.000Z', createdAt: '2026-10-14T00:30:00.000Z',
    customerName: 'Ana Reyes', serviceName: 'Aircon repair', intakeAnswers: null,
  }),
}));

import ProviderJobDetailScreen from '../app/provider/job/[id]';

function renderWithThread(conversationId: string | null): { view: ReturnType<typeof render>; client: QueryClient } {
  routeGets({
    '/api/v1/providers/me/job-requests/booking-req-1': ok(providerRequestFixture()),
    '/api/v1/bookings/booking-req-1/quotes': ok([quoteFixture({ status: 'accepted', conversationId })]),
    '/api/v1/providers/me/commission-preview*': { data: { data: { tier: 'pro', commissionRate: 0.1 } } },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><ProviderJobDetailScreen /></QueryClientProvider>);
  return { view, client };
}

it('HA-M2-557: a payment-pending quote job shows Chat with Customer when the request thread exists, and not without one', async () => {
  const withThread = renderWithThread('conversation-1');
  fireEvent.click(await screen.findByRole('button', { name: 'Chat with Customer' }));
  expect(mockPush).toHaveBeenCalledWith('/provider/chat/booking-req-1');
  withThread.view.unmount();

  const withoutThread = renderWithThread(null);
  expect(await screen.findByText('Awaiting Payment')).toBeTruthy();
  // The absence counts only once the pro's own quote (with no thread) has loaded.
  await waitFor(() => expect(withoutThread.client.getQueryState(['providerOwnQuote', 'booking-req-1'])?.status).toBe('success'));
  expect(screen.queryByRole('button', { name: 'Chat with Customer' })).toBeNull();
});
