// HA-M2-545 (D38 Milestone 2, package P5b): the request status screen shows
// what the customer sent (their private photos, video and voice note,
// through the shared request gallery and its signed links).
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BOOKING_ID, ok, requestStatusFixture, routeGets } from '../test-support/request-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import RequestStatusScreen from '../app/customer/booking/request-status';

it('HA-M2-545: the request status screen shows the request\'s own photo and voice note under "What you sent"', async () => {
  routeGets({
    [`/api/v1/bookings/${BOOKING_ID}/request-status`]: ok(requestStatusFixture()),
    [`/api/v1/job-media/booking/${BOOKING_ID}`]: ok({
      items: [
        { id: 'photo-1', purpose: 'job_request', kind: 'photo', status: 'attached', mime: 'image/jpeg', sizeBytes: 1000, durationMs: null, width: 800, height: 600, createdAt: '2026-10-14T00:30:00.000Z', url: '/api/v1/job-media/file/photo-1-token', expiresAt: '2026-10-14T01:10:00.000Z' },
        { id: 'voice-1', purpose: 'job_request', kind: 'voice', status: 'attached', mime: 'audio/mp4', sizeBytes: 3000, durationMs: 9000, width: null, height: null, createdAt: '2026-10-14T00:30:00.000Z', url: '/api/v1/job-media/file/voice-1-token', expiresAt: '2026-10-14T01:10:00.000Z' },
      ],
      legacyPhotos: [],
    }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><RequestStatusScreen /></QueryClientProvider>);

  expect(await screen.findByText('What you sent')).toBeTruthy();
  expect(container.querySelector('[accessibilitylabel="Job photo 1"]')?.getAttribute('source')).toContain('/api/v1/job-media/file/photo-1-token');
  expect(screen.getByRole('button', { name: 'Play customer voice note' })).toBeTruthy();
});
