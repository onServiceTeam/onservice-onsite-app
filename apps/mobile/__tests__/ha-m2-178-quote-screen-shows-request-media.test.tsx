// HA-M2-178 (D38 Milestone 2, package P5b): before pricing, the provider sees
// the customer's private photos (as thumbnails), video and voice note on the
// request screen, through the shared request gallery and its signed links
// (GET /api/v1/job-media/booking/:id).
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BOOKING_ID, ok, quoteScreenGets } from '../test-support/request-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

const item = (id: string, kind: 'photo' | 'video' | 'voice', durationMs: number | null): Record<string, unknown> => ({
  id, purpose: 'job_request', kind, status: 'attached', mime: kind === 'photo' ? 'image/jpeg' : kind === 'video' ? 'video/mp4' : 'audio/mp4',
  sizeBytes: 1000, durationMs, width: null, height: null, createdAt: '2026-10-14T00:30:00.000Z',
  url: `/api/v1/job-media/file/${id}-token`, expiresAt: '2026-10-14T01:10:00.000Z',
});

it('HA-M2-178: the request screen shows the customer photo thumbnails, the video and the voice note', async () => {
  quoteScreenGets(undefined, {
    [`/api/v1/job-media/booking/${BOOKING_ID}`]: ok({
      items: [item('photo-1', 'photo', null), item('photo-2', 'photo', null), item('video-1', 'video', 12000), item('voice-1', 'voice', 21000)],
      legacyPhotos: [],
    }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);

  expect(await screen.findByText('What the customer sent')).toBeTruthy();
  const photos = Array.from(container.querySelectorAll('[accessibilitylabel^="Job photo"]')).map((node) => node.getAttribute('source'));
  expect(photos).toHaveLength(2);
  expect(photos[0]).toContain('/api/v1/job-media/file/photo-1-token');
  expect(photos[1]).toContain('/api/v1/job-media/file/photo-2-token');
  expect(screen.getByLabelText('Job video, 0:12').getAttribute('data-src')).toContain('/api/v1/job-media/file/video-1-token');
  expect(screen.getByRole('button', { name: 'Play customer voice note' })).toBeTruthy();
  expect(screen.getByRole('button', { name: "View the customer's photos full screen, 2 photos" })).toBeTruthy();
});
