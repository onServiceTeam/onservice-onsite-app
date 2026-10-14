// HA-M2-226 (Milestone 2, P6-M2): signed media links expire (the file route
// answers 410). When a player fails on a link that was live when it was
// fetched and has expired since, the panel fetches fresh links once and the
// player switches to the new link. Each fetch is an audited view, so nothing
// reloads on a timer. A failure on a live link never reloads (HA-M2-240).
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

import { JobMediaPanel } from '@/components/booking/JobMediaPanel';

function voiceList(token: string, expiresAt: string) {
  return {
    data: {
      success: true,
      data: {
        items: [{
          id: 'voice-1',
          purpose: 'job_request',
          kind: 'voice',
          status: 'attached',
          mime: 'audio/mp4',
          sizeBytes: 90000,
          durationMs: 12000,
          width: null,
          height: null,
          createdAt: '2026-10-14T01:00:00.000Z',
          url: `/api/v1/job-media/file/${token}`,
          expiresAt,
        }],
        legacyPhotos: [],
      },
    },
  };
}

it('HA-M2-226: a voice note whose link expired while on screen fetches fresh links once when it fails to play, and plays from the new link', async () => {
  get
    // Live when fetched, gone a moment later (real links last a few minutes).
    .mockImplementationOnce(async () => voiceList('expiring-token', new Date(Date.now() + 800).toISOString()))
    .mockImplementationOnce(async () => voiceList('fresh-token', new Date(Date.now() + 600_000).toISOString()));

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <JobMediaPanel bookingId="booking-1" />
    </QueryClientProvider>,
  );

  const expiredPlayer = await screen.findByLabelText('Sent with the request: voice note');
  expect(expiredPlayer).toHaveAttribute('src', '/api/v1/job-media/file/expiring-token');
  expect(await screen.findByText(/These viewing links have expired/, undefined, { timeout: 3000 })).toBeInTheDocument();
  expect(get).toHaveBeenCalledTimes(1);

  fireEvent.error(expiredPlayer);

  await waitFor(() => {
    expect(screen.getByLabelText('Sent with the request: voice note'))
      .toHaveAttribute('src', '/api/v1/job-media/file/fresh-token');
  });
  expect(get).toHaveBeenCalledTimes(2);
  expect(get).toHaveBeenLastCalledWith('/api/v1/job-media/booking/booking-1');
  expect(screen.queryByText(/These viewing links have expired/)).not.toBeInTheDocument();
});
