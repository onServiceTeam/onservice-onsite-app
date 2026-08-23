import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { DisputeActions, type DisputeFullDetail } from '../DisputeDetailPage';

it('Bug UX-012 — assigns disputes from named active admins instead of a pasted UUID', async () => {
  vi.mocked(api.get).mockResolvedValue({
    status: 200,
    ok: true,
    data: {
      data: [{ id: 'admin-1', first_name: 'Ana', last_name: 'Reyes', role: 'admin' }],
    },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const detail = {
    id: 'dispute-1',
    bookingId: 'booking-1',
    status: 'under_review',
    tier: 1,
    type: 'quality',
    description: 'Customer reports incomplete work.',
    filedBy: 'customer',
    filedAt: '2026-08-23T08:00:00.000Z',
    ageHours: 2,
    priorityScore: 10,
    resolvedAt: null,
    resolvedBy: null,
    resolutionType: null,
    refundAmount: null,
    decisionNotes: null,
    internalNotes: null,
    providerResponse: null,
    providerRespondedAt: null,
    assignedTo: null,
    booking: null,
    customer: null,
    provider: null,
    evidence: [],
  } satisfies DisputeFullDetail;

  render(
    <QueryClientProvider client={client}>
      <DisputeActions detail={detail} />
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('option', { name: 'Ana Reyes (Admin)' })).toBeTruthy();
  expect(screen.getByRole('combobox', { name: 'Admin to assign dispute' })).toBeTruthy();
  expect(screen.queryByRole('textbox', { name: /admin user ID/i })).toBeNull();
});
