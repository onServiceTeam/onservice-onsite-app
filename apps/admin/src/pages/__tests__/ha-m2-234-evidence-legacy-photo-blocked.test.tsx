// HA-M2-234 (Milestone 2, P6-M2 fixer): photos saved by older app versions
// are absolute links on the upload host (UPLOAD_BASE_URL), which the admin
// page's image policy (nginx.conf img-src) does not list. When one fails to
// load, the panel says it could not be shown and offers "Open in a new tab"
// instead of leaving a broken image box.
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

const LEGACY_URL = 'https://api.onservice.ph/uploads/bookings/old-photo.jpg';

it('HA-M2-234: an older request photo that fails to load shows a plain note with an open-in-new-tab link', async () => {
  get.mockResolvedValue({ data: { success: true, data: { items: [], legacyPhotos: [LEGACY_URL] } } });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <JobMediaPanel bookingId="booking-1" />
    </QueryClientProvider>,
  );

  const older = await screen.findByRole('region', { name: 'Photos from an older app version' });
  fireEvent.error(within(older).getByRole('img', { name: 'Older request photo 1 of 1' }));

  const note = await within(older).findByRole('alert');
  expect(note).toHaveTextContent('Older request photo 1 could not be shown on this page.');
  expect(within(note).getByRole('link', { name: 'Open in a new tab' })).toHaveAttribute('href', LEGACY_URL);
  expect(within(older).queryByRole('img')).not.toBeInTheDocument();
  expect(get).toHaveBeenCalledTimes(1);
});
