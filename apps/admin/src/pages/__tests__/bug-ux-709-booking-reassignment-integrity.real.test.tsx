import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Provider feed unavailable' }));

import { BookingActions } from '../BookingDetailPage';

it('Bug UX-709 — booking reassignment recovers its provider feed and excludes the current no-op assignment', async () => {
  apiMocks.get
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({
      data: {
        data: [
          { id: 'provider-current', businessName: 'Current Provider', city: 'Cebu City' },
          { id: 'provider-next', businessName: 'Next Provider', city: 'Mandaue' },
        ],
      },
    });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <BookingActions bookingId="11111111-1111-4111-8111-111111111111" currentProviderId="provider-current" />
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Reassign' }));
  expect(await screen.findByText(/No replacement can be selected until this feed recovers/i)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Retry providers' }));

  expect(await screen.findByRole('option', { name: 'Next Provider · Mandaue' })).toBeVisible();
  expect(screen.queryByRole('option', { name: 'Current Provider · Cebu City' })).toBeNull();
  expect(screen.getByText(/server rechecks account approval/i)).toBeVisible();
});
