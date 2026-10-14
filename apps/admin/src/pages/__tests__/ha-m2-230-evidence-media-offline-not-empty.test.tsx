// HA-M2-230 (Milestone 2, P6-M2 fixer): TanStack Query pauses a query while
// the browser is offline (no data, no error, isLoading false). The request
// media panel must then say it has not loaded, never "No request media
// attached", because it has not asked the server.
import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

import { JobMediaPanel } from '@/components/booking/JobMediaPanel';

afterEach(() => {
  onlineManager.setOnline(true);
});

it('HA-M2-230: while the browser is offline the request media panel says it has not loaded instead of claiming nothing was attached', async () => {
  get.mockResolvedValue({ data: { success: true, data: { items: [], legacyPhotos: [] } } });
  onlineManager.setOnline(false);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <JobMediaPanel bookingId="booking-1" />
    </QueryClientProvider>,
  );

  const panel = screen.getByRole('region', { name: /Request photos, video and voice note/ });
  expect(await within(panel).findByText(/This browser is offline, so the request media has not been loaded yet/))
    .toBeInTheDocument();
  expect(within(panel).queryByText('No request media attached')).not.toBeInTheDocument();
  expect(get).not.toHaveBeenCalled();

  // The note promises the media loads when the connection comes back
  // (refetchOnReconnect is off, but a paused first load resumes).
  act(() => { onlineManager.setOnline(true); });
  expect(await within(panel).findByText('No request media attached')).toBeInTheDocument();
  expect(get).toHaveBeenCalledTimes(1);
});
