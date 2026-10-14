// HA-M2-553 (D38 Milestone 2, package P5b): the slot can pass between loading
// the confirm screen and tapping Confirm. Accept then answers 409
// QUOTE_SLOT_PASSED; the screen switches to the passed-slot guidance and
// does not go to payment.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { BOOKING_ID, QUOTE_ID, apiError, confirmPreviewFixture, ok, routeGets } from '../test-support/request-fixtures';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({ bookingId: 'booking-req-1', quoteId: 'quote-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));

import ConfirmQuoteScreen from '../app/customer/booking/confirm-quote';

it('HA-M2-553: a 409 QUOTE_SLOT_PASSED from accept shows the passed-slot guidance and stays off the pay screen', async () => {
  routeGets({ [`/api/v1/bookings/${BOOKING_ID}/quotes/${QUOTE_ID}/confirm-preview`]: ok(confirmPreviewFixture()) });
  jest.mocked(api.post).mockReset();
  jest.mocked(api.post).mockRejectedValue(apiError(409, 'QUOTE_SLOT_PASSED', 'The time this pro offered has passed.'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ConfirmQuoteScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Confirm booking' }));

  expect(await screen.findByText('This time has passed')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Confirm booking' }) as HTMLButtonElement).disabled).toBe(true);
  expect(mockReplace).not.toHaveBeenCalled();
});
