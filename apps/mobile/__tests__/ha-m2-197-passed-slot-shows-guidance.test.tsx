// HA-M2-197 (D38 Milestone 2, package P5b): when the time the pro offered has
// passed (the preview's slot.status is 'passed'), Confirm booking is blocked
// and the customer is guided to message the pro or go back and decline.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { BOOKING_ID, PROVIDER_USER_ID, QUOTE_ID, confirmPreviewFixture, ok, routeGets } from '../test-support/request-fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-req-1', quoteId: 'quote-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));

import ConfirmQuoteScreen from '../app/customer/booking/confirm-quote';

it('HA-M2-197: a passed slot blocks Confirm booking and offers Message the pro', async () => {
  routeGets({
    [`/api/v1/bookings/${BOOKING_ID}/quotes/${QUOTE_ID}/confirm-preview`]: ok(confirmPreviewFixture({
      slot: { date: '2026-10-14', window: 'morning', startsAt: null, status: 'passed' },
    })),
  });
  jest.mocked(api.post).mockClear();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ConfirmQuoteScreen /></QueryClientProvider>);

  expect(await screen.findByText('This time has passed')).toBeTruthy();
  expect(screen.getByText('The time this pro offered has passed, so this quote cannot be confirmed. Message the pro to agree a new time, or go back and decline this quote so other pros can respond.')).toBeTruthy();
  expect(screen.queryByText(/^Be available from/)).toBeNull();
  const confirm = screen.getByRole('button', { name: 'Confirm booking' }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Message the pro' }));
  expect(mockPush).toHaveBeenCalledWith(`/customer/chat/${BOOKING_ID}?provider=${PROVIDER_USER_ID}`);
  expect(api.post).not.toHaveBeenCalled();
});
