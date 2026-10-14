// HA-M2-240 (Milestone 2, P6-M2 fixer; split out of HA-M2-226): a player
// that fails on a link that has not expired (a format this browser cannot
// play, a missing file) shows a plain message with an "Open in a new tab"
// link and never reloads, since every reload is an audited view and a reload
// would not help.
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

import { JobMediaPanel } from '@/components/booking/JobMediaPanel';

it('HA-M2-240: a voice note that fails on a live link shows a plain message and does not reload the links', async () => {
  get.mockResolvedValue({
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
          url: '/api/v1/job-media/file/live-token',
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        }],
        legacyPhotos: [],
      },
    },
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <JobMediaPanel bookingId="booking-1" />
    </QueryClientProvider>,
  );

  fireEvent.error(await screen.findByLabelText('Sent with the request: voice note'));

  const note = await screen.findByRole('alert');
  expect(note).toHaveTextContent('This voice note could not be played in this browser.');
  expect(within(note).getByRole('link', { name: 'Open in a new tab' }))
    .toHaveAttribute('href', '/api/v1/job-media/file/live-token');
  expect(screen.queryByLabelText('Sent with the request: voice note')).not.toBeInTheDocument();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(get).toHaveBeenCalledTimes(1);
});
