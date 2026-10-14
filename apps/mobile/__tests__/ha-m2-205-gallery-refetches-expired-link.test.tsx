// HA-M2-205 (D38 Milestone 2, package P5a): the request gallery shows the
// customer's photos, video and voice note from their signed links, and when
// a link has expired (they live 10 minutes) and the player fails, it asks the
// server once for fresh links.
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { JobMediaGallery } from '@/components/job-media/JobMediaGallery';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __video: video } = require('expo-video') as {
  __video: { players: Array<{ __emit: (event: string, payload: unknown) => void }>; reset: () => void };
};

function mediaList(generation: number): unknown {
  const token = `token-${generation}`;
  return {
    data: { success: true, data: {
      items: [
        { id: 'photo-1', purpose: 'job_request', kind: 'photo', status: 'attached', mime: 'image/jpeg', sizeBytes: 1000, durationMs: null, width: 800, height: 600, createdAt: '2026-10-14T01:00:00.000Z', url: `/api/v1/job-media/file/photo-${token}`, expiresAt: '2026-10-14T01:10:00.000Z' },
        { id: 'video-1', purpose: 'job_request', kind: 'video', status: 'attached', mime: 'video/mp4', sizeBytes: 9000, durationMs: 12000, width: 1280, height: 720, createdAt: '2026-10-14T01:00:00.000Z', url: `/api/v1/job-media/file/video-${token}`, expiresAt: '2026-10-14T01:10:00.000Z' },
        { id: 'voice-1', purpose: 'job_request', kind: 'voice', status: 'attached', mime: 'audio/mp4', sizeBytes: 3000, durationMs: 21000, width: null, height: null, createdAt: '2026-10-14T01:00:00.000Z', url: `/api/v1/job-media/file/voice-${token}`, expiresAt: '2026-10-14T01:10:00.000Z' },
      ],
      legacyPhotos: [],
    } },
  };
}

beforeEach(() => video.reset());

it('HA-M2-205: the gallery renders photo, video and voice note, and re-fetches links after an expired one fails', async () => {
  let generation = 0;
  jest.mocked(api.get).mockReset();
  jest.mocked(api.get).mockImplementation((async (url: string) => {
    if (url === '/api/v1/job-media/booking/booking-5') {
      generation += 1;
      return mediaList(generation);
    }
    throw new Error(`unexpected GET ${url}`);
  }) as never);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><JobMediaGallery bookingId="booking-5" /></QueryClientProvider>);

  const player = await screen.findByLabelText('Job video, 0:12');
  // expo-image renders as <Image> in the jest harness, with its props as attributes.
  const photo = container.querySelector('[accessibilitylabel="Job photo 1"]');
  expect(photo?.getAttribute('source')).toContain('/api/v1/job-media/file/photo-token-1');
  expect(player.getAttribute('data-src')).toContain('/api/v1/job-media/file/video-token-1');
  expect(player.getAttribute('data-native-controls')).toBe('true');
  expect(screen.getByRole('button', { name: 'Play customer voice note' })).toBeTruthy();
  expect(screen.getByText('0:21')).toBeTruthy();
  expect(api.get).toHaveBeenCalledTimes(1);

  // The video's link expired: the player reports an error.
  act(() => { video.players[0]!.__emit('statusChange', { status: 'error', error: { message: 'HTTP 410' } }); });

  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  await waitFor(() => {
    expect(screen.getByLabelText('Job video, 0:12').getAttribute('data-src')).toContain('/api/v1/job-media/file/video-token-2');
  });
});
