import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Timeline service unavailable' }));

import { TimelineTab } from '../BookingDetailPage';

it('Bug UX-708 — a failed Booking 360 evidence feed has a local retry that restores its real record', async () => {
  apiMocks.get
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({
      data: {
        success: true,
        data: [{
          at: '2026-08-31T00:00:00.000Z',
          type: 'booking_confirmed',
          description: 'Customer confirmed the booking.',
          actor: { kind: 'user', id: 'customer-1', name: 'Maria Santos' },
        }],
      },
    });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <TimelineTab bookingId="11111111-1111-4111-8111-111111111111" />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Timeline unavailable')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Retry timeline' }));

  expect(await screen.findByText('Customer confirmed the booking.')).toBeVisible();
  expect(apiMocks.get).toHaveBeenCalledTimes(2);
});
