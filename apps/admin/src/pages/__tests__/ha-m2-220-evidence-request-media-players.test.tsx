// HA-M2-220 (Milestone 2, P6-M2): Booking 360 Evidence tab shows the
// customer's private request media through the signed links the API returns
// from GET /api/v1/job-media/booking/:bookingId (job-media.routes.ts).
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

import { EvidenceTab } from '../BookingDetailPage';

const LIVE_UNTIL = '2099-01-01T00:10:00.000Z';

function mediaItem(id: string, kind: 'photo' | 'video' | 'voice', mime: string, durationMs: number | null) {
  return {
    id,
    purpose: 'job_request',
    kind,
    status: 'attached',
    mime,
    sizeBytes: 524288,
    durationMs,
    width: kind === 'photo' ? 1200 : null,
    height: kind === 'photo' ? 900 : null,
    createdAt: '2026-10-14T01:00:00.000Z',
    url: `/api/v1/job-media/file/${id}.viewer.4070908800.sig`,
    expiresAt: LIVE_UNTIL,
  };
}

it('HA-M2-220: the Evidence tab renders the request photo, video and voice note from their signed links', async () => {
  get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/job-media/booking/booking-1') {
      return {
        data: {
          success: true,
          data: {
            items: [
              mediaItem('photo-1', 'photo', 'image/jpeg', null),
              mediaItem('video-1', 'video', 'video/mp4', 24000),
              mediaItem('voice-1', 'voice', 'audio/mp4', 12000),
            ],
            legacyPhotos: [],
          },
        },
      };
    }
    throw new Error('Proof summary is not part of this test.');
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EvidenceTab bookingId="booking-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  const panel = await screen.findByRole('region', { name: /Request photos, video and voice note/ });
  const photo = await within(panel).findByRole('img', { name: 'Sent with the request: photo 1 of 1' });
  expect(photo).toHaveAttribute('src', '/api/v1/job-media/file/photo-1.viewer.4070908800.sig');

  const video = within(panel).getByLabelText('Sent with the request: video');
  expect(video.tagName).toBe('VIDEO');
  expect(video).toHaveAttribute('controls');
  expect(video).toHaveAttribute('src', '/api/v1/job-media/file/video-1.viewer.4070908800.sig');

  const voice = within(panel).getByLabelText('Sent with the request: voice note');
  expect(voice.tagName).toBe('AUDIO');
  expect(voice).toHaveAttribute('controls');
  expect(voice).toHaveAttribute('src', '/api/v1/job-media/file/voice-1.viewer.4070908800.sig');

  expect(within(panel).getByText('Video · 0:24 · 512 KB')).toBeInTheDocument();
  expect(within(panel).getByText('Voice note · 0:12')).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('/api/v1/job-media/booking/booking-1');
});
