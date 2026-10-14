// HA-M2-560 (D38 Milestone 2, package P5b, review fix): the customer's
// photos are signed links that live 10 minutes. A pro who spends longer than
// that writing a quote and then opens "View photos full screen" used to get
// only "image unavailable" placeholders, because the viewer reused the old
// links. Opening the viewer now fetches fresh links first when the list is
// older than 8 minutes, and the viewer shows the fresh link.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { BOOKING_ID, NOW, ok, quoteScreenGets } from '../test-support/request-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

const MEDIA_URL = `/api/v1/job-media/booking/${BOOKING_ID}`;

function photo(token: string): Record<string, unknown> {
  return {
    id: 'photo-1', purpose: 'job_request', kind: 'photo', status: 'attached', mime: 'image/jpeg',
    sizeBytes: 1000, durationMs: null, width: null, height: null, createdAt: '2026-10-14T00:30:00.000Z',
    url: `/api/v1/job-media/file/${token}`, expiresAt: '2026-10-14T01:10:00.000Z',
  };
}

function mediaReads(): number {
  return jest.mocked(api.get).mock.calls.filter((call) => call[0] === MEDIA_URL).length;
}

afterEach(() => jest.restoreAllMocks());

it('HA-M2-560: opening the full-screen viewer after 8 minutes fetches fresh photo links and shows them', async () => {
  let clock = NOW;
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
  let reads = 0;
  quoteScreenGets(undefined, {
    [MEDIA_URL]: () => { reads += 1; return ok({ items: [photo(reads === 1 ? 'old-token' : 'fresh-token')], legacyPhotos: [] }); },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);
  const open = await screen.findByRole('button', { name: "View the customer's photos full screen, 1 photo" });
  expect(mediaReads()).toBe(1);

  // Nine minutes writing the quote: the first links expire at ten.
  clock = NOW + 9 * 60_000;
  fireEvent.click(open);

  await waitFor(() => expect(mediaReads()).toBe(2));
  await waitFor(() => {
    const shown = container.querySelector('[accessibilitylabel="Customer photo 1, full screen"][source]');
    expect(shown?.getAttribute('source')).toContain('fresh-token');
  });
});
