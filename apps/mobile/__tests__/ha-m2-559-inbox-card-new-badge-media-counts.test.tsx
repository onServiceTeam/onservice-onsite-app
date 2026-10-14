// HA-M2-559 (D38 Milestone 2, package P5b): an inbox card marks a request
// this provider has not opened yet as "New" (viewedAt is null), says what
// private media the customer attached ("Includes 2 photos, 1 video and 1
// voice note"), and tapping it opens the request screen with the quote form.
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { providerRequestFixture, routeGets } from '../test-support/request-fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
  byBreakpoint: (_breakpoint: string, values: { phone: number }) => values.phone,
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import { RequestInbox } from '@/components/provider/RequestInbox';

it('HA-M2-559: an unopened request card shows New and its media counts, and opens the request screen', async () => {
  routeGets({
    '/api/v1/providers/me/job-requests': { data: { success: true, total: 2, page: 1, pageSize: 50, requests: [
      providerRequestFixture({ id: 'booking-new', serviceName: 'Aircon repair', viewedAt: null, mediaCounts: { photo: 2, video: 1, voice: 1 } }),
      providerRequestFixture({ id: 'booking-seen', serviceName: 'Sink unclogging', viewedAt: '2026-10-14T00:50:00.000Z', mediaCounts: { photo: 0, video: 0, voice: 0 } }),
    ] } },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><RequestInbox /></QueryClientProvider>);

  const fresh = await screen.findByRole('button', { name: 'Open Aircon repair job request and prepare a quote' });
  const seen = screen.getByRole('button', { name: 'Open Sink unclogging job request and prepare a quote' });
  expect(within(fresh).getByLabelText('New')).toBeTruthy();
  expect(within(fresh).getByText('Includes 2 photos, 1 video and 1 voice note')).toBeTruthy();
  expect(within(seen).queryByLabelText('New')).toBeNull();
  expect(within(seen).queryByText(/^Includes /)).toBeNull();

  fireEvent.click(fresh);
  expect(mockPush).toHaveBeenCalledWith('/provider/job/booking-new/quote');
});
