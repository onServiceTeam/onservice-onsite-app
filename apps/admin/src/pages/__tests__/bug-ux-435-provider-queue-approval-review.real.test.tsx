import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { VETTING_ITEMS, buildChecklistSummary } from '@/components/VettingChecklist';
import ProvidersPage from '../ProvidersPage';

it('Bug UX-435 — the provider queue uses the same atomic approval-review contract as Provider 360', async () => {
  vi.mocked(api.get).mockResolvedValueOnce({
    data: {
      success: true,
      data: [
        {
          id: 'provider-1',
          userId: 'user-1',
          businessName: 'Cebu Aircon Care',
          fullName: 'Ramil Santos',
          phone: '+639170000001',
          email: 'ramil@example.com',
          status: 'pending',
          tier: 'new',
          rating: 0,
          totalReviews: 0,
          totalJobs: 0,
          serviceRadiusKm: 20,
          isAvailable: false,
          city: 'Cebu City',
          province: 'Cebu',
          createdAt: '2026-08-30T01:00:00.000Z',
        },
      ],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    },
  } as never);
  vi.mocked(api.get).mockResolvedValueOnce({ data: { success: true, data: {
    id: 'provider-1', status: 'pending', documents: {
      governmentIdUrl: '/private/front', governmentIdBackUrl: '/private/back',
      selfieUrl: '/private/selfie', nbiClearanceUrl: '/private/nbi',
    },
  } } } as never);
  vi.mocked(api.put).mockResolvedValueOnce({ data: { success: true } } as never);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ProvidersPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
  await screen.findByRole('checkbox', { name: 'Government ID front and back reviewed and legible' });
  for (const item of VETTING_ITEMS) {
    fireEvent.click(screen.getByRole('checkbox', { name: item.label }));
  }
  fireEvent.change(screen.getByRole('textbox', { name: 'Approval rationale' }), {
    target: { value: 'Identity, qualifications, service scope, and references were verified.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith('/api/v1/admin/providers/provider-1/approve', {
      reason: 'Identity, qualifications, service scope, and references were verified.',
      checklistConfirmed: true,
      checklistSummary: buildChecklistSummary(),
    }),
  );
});
