import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { BookingActions } from '../BookingDetailPage';

it('Bug UX-717 — Booking 360 can search beyond the initially loaded accepting-work provider page', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url.includes('search=Far')) return { data: { data: [
      { id: 'provider-far', businessName: 'Far Directory Pro', city: 'Mandaue' },
    ] } };
    return { data: { data: [] } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <BookingActions bookingId="11111111-1111-4111-8111-111111111111" />
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Reassign' }));
  fireEvent.change(screen.getByLabelText('Search accepting-work providers'), { target: { value: 'Far' } });

  expect(await screen.findByRole('option', { name: 'Far Directory Pro · Mandaue' })).toBeVisible();
  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith(expect.stringContaining('search=Far')));
});
