// HA-M2-551 (D38 Milestone 2, package P5b): while E09 is open, the confirm
// screen's cancellation summary is the policy's own introduction (from the
// public cancellation-policy endpoint) and a link to the full policy, with
// no refund percentages, even though the policy has tiers.
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BOOKING_ID, QUOTE_ID, confirmPreviewFixture, ok, routeGets } from '../test-support/request-fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-req-1', quoteId: 'quote-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));

import ConfirmQuoteScreen from '../app/customer/booking/confirm-quote';

it('HA-M2-551: the cancellation summary shows the policy introduction and a link, and no percentages', async () => {
  routeGets({
    [`/api/v1/bookings/${BOOKING_ID}/quotes/${QUOTE_ID}/confirm-preview`]: ok(confirmPreviewFixture()),
    '/api/v1/settings/cancellation-policy': ok({
      version: 3,
      effective_from: '2026-09-01',
      intro_text: 'You can cancel a booking from the booking screen. What you get back depends on how close to the start time you cancel.',
      tiers: [
        { min_hours_before: 24, max_hours_before: null, refund_percent: 100, fee_percent: 0, label: '24 hours or more' },
        { min_hours_before: 0, max_hours_before: 24, refund_percent: 50, fee_percent: 50, label: 'Under 24 hours' },
      ],
      legal_disclaimer: 'Subject to the Terms.',
      provider_no_show_credit_php: 200,
    }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ConfirmQuoteScreen /></QueryClientProvider>);

  const section = await screen.findByLabelText('Cancellation');
  expect(await within(section).findByText('You can cancel a booking from the booking screen. What you get back depends on how close to the start time you cancel.')).toBeTruthy();
  expect(section.textContent).not.toMatch(/%/);
  expect(section.textContent).not.toContain('Under 24 hours');
  fireEvent.click(within(section).getByRole('link', { name: 'Read the full cancellation policy' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/customer/terms', params: { tab: 'terms' } });
});
