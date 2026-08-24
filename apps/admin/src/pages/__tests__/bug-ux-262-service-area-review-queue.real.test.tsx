import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn().mockResolvedValue({ data: { success: true } }),
  patch: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: () => 'Request failed',
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import ServiceAreasPage from '../ServiceAreasPage';

it('Bug UX-262 — Service Areas gives operations a real provider-change queue and submits an explained super-admin decision', async () => {
  apiMocks.get.mockImplementation((url: string) => {
    if (url.endsWith('/stats')) {
      return Promise.resolve({ data: { success: true, data: {
        totalAreas: 2, activeAreas: 2, totalProviders: 8, totalWaitlist: 3, areasByStatus: { active: 2 },
      } } });
    }
    if (url.endsWith('/service-area-changes')) {
      return Promise.resolve({ data: { success: true, data: [{
        id: 'change-1', providerId: 'user-1', providerRecordId: 'provider-1',
        providerName: 'Juan Provider', providerEmail: 'juan@example.com', providerPhone: '+639171234567',
        currentAreaName: 'Mandaue', requestedAreaName: 'Cebu City',
        currentRadiusKm: 15, requestedRadiusKm: 25,
        requestedLatitude: 10.3157, requestedLongitude: 123.8854,
        reason: 'The workshop moved closer to Cebu City.', createdAt: '2026-08-25T00:00:00.000Z',
      }] } });
    }
    return Promise.resolve({ data: {
      success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ServiceAreasPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Provider Change Requests')).toBeVisible();
  expect(await screen.findByText('Juan Provider')).toBeVisible();
  expect(screen.getByText('Mandaue')).toBeVisible();
  expect(screen.getByText('Cebu City')).toBeVisible();
  expect(screen.getByText('10.31570, 123.88540')).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  fireEvent.change(screen.getByLabelText('Decision reason'), {
    target: { value: 'Verified the provider pin and the active Cebu City market.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Approve change' }));

  await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith(
    '/api/v1/admin/service-area-changes/change-1/decide',
    {
      decision: 'approved',
      reason: 'Verified the provider pin and the active Cebu City market.',
    },
  ));
});
