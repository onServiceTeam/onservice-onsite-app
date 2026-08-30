import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: (error: unknown) => String(error) }));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn() }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import DisputesPage from '../DisputesPage';

beforeEach(() => {
  apiMocks.get.mockReset();
  apiMocks.put.mockReset();
  apiMocks.post.mockReset();
  apiMocks.get.mockResolvedValue({
    data: {
      success: true,
      data: [{
        id: 'dispute-12345678',
        bookingId: 'booking-12345678',
        customerName: 'Maria Santos',
        providerName: 'Cebu Home Care',
        type: 'service_quality',
        status: 'open',
        tier: 1,
        description: 'The completed work did not match the agreed scope.',
        providerResponse: 'The provider response is recorded.',
        refundAmount: 0,
        createdAt: '2026-08-29T00:00:00.000Z',
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    },
  });
  apiMocks.put.mockResolvedValue({ data: { success: true } });
});

it('Bug UX-514 — resolving a dispute uses an in-app money-impact confirmation before submitting the resolution', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DisputesPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Resolve dispute dispute-12345678' }));
  fireEvent.change(screen.getByLabelText('Resolution Type'), { target: { value: 'full_refund' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Decision notes' }), {
    target: { value: 'Evidence supports a full refund to the customer.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));

  expect(await screen.findByRole('heading', { name: 'Apply dispute resolution?' })).toBeInTheDocument();
  expect(screen.getByText(/Refund outcomes can move held funds and update the booking/)).toBeInTheDocument();
  expect(apiMocks.put).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Apply resolution' }));
  await waitFor(() => expect(apiMocks.put).toHaveBeenCalledWith(
    '/api/v1/disputes/dispute-12345678/resolve',
    expect.objectContaining({
      resolutionType: 'full_refund',
      decisionNotes: 'Evidence supports a full refund to the customer.',
    }),
  ));
});
