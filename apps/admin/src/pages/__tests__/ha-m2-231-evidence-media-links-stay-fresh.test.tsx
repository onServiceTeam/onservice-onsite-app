// HA-M2-231 (Milestone 2, P6-M2 fixer): every load of request media writes a
// job_media_viewed audit row, so the panel keeps the links it has until just
// before they expire, measured from when they were fetched. Leaving the
// Evidence tab and coming back halfway through a link's life must not load
// (and log) them again; coming back just before expiry does.
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

import { JobMediaPanel } from '@/components/booking/JobMediaPanel';

const FETCHED_AT = Date.parse('2026-10-14T01:00:00.000Z');
// JOB_MEDIA_CONFIG.urlTtlSeconds is 600.
const LINK_LIFE_MS = 600_000;

function voiceList(expiresAtMs: number) {
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
          createdAt: '2026-10-14T00:55:00.000Z',
          url: `/api/v1/job-media/file/voice-1.${expiresAtMs}`,
          expiresAt: new Date(expiresAtMs).toISOString(),
        }],
        legacyPhotos: [],
      },
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

it('HA-M2-231: returning to the Evidence tab halfway through the link life reuses the links without a second audited load', async () => {
  // Only the clock is faked; React Query and Testing Library timers stay real.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FETCHED_AT);
  get.mockImplementation(async () => voiceList(Date.now() + LINK_LIFE_MS));

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const panel = (): React.ReactElement => (
    <QueryClientProvider client={client}>
      <JobMediaPanel bookingId="booking-1" />
    </QueryClientProvider>
  );

  const first = render(panel());
  await screen.findByLabelText('Sent with the request: voice note');
  expect(get).toHaveBeenCalledTimes(1);
  first.unmount();

  // 4 min 50 s later (links still have 5 min 10 s left): back to Evidence.
  vi.setSystemTime(FETCHED_AT + 290_000);
  const second = render(panel());
  await screen.findByLabelText('Sent with the request: voice note');
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(get).toHaveBeenCalledTimes(1);
  second.unmount();

  // 25 s before expiry the links are no longer fresh, so coming back loads new ones.
  vi.setSystemTime(FETCHED_AT + LINK_LIFE_MS - 25_000);
  render(panel());
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
});
