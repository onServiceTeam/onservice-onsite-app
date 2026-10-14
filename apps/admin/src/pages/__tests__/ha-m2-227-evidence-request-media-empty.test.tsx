// HA-M2-227 (Milestone 2, P6-M2): when a booking has no attached request
// media, the Evidence tab says so plainly instead of showing an empty grid.
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

it('HA-M2-227: the Evidence tab shows honest empty copy when no request media is attached', async () => {
  get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/job-media/booking/booking-1') {
      return { data: { success: true, data: { items: [], legacyPhotos: [] } } };
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
  expect(await within(panel).findByText('No request media attached')).toBeInTheDocument();
  expect(within(panel).getByText(
    'No photo, video or voice note was sent with this request. Only files that finished uploading and were sent with the request appear here.',
  )).toBeInTheDocument();
  expect(panel.querySelector('img, video, audio')).toBeNull();
  expect(within(panel).queryByRole('alert')).not.toBeInTheDocument();
});
