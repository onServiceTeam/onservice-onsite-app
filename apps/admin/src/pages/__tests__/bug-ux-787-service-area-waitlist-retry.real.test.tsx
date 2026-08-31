import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import api from '@/lib/api';
import ServiceAreasPage from '../ServiceAreasPage';

beforeEach(() => {
  vi.mocked(api.get).mockReset().mockImplementation(async (url: string) => {
    if (url.endsWith('/stats')) return { data: { success: true, data: {
      totalAreas: 1, activeAreas: 1, totalProviders: 5, totalWaitlist: 3, pendingWaitlist: 3, waitlistNotified: 0, areasByStatus: { active: 1 },
    } } } as never;
    if (url.endsWith('/service-area-changes')) return { data: { success: true, data: [] } } as never;
    return { data: { success: true, data: [{
      id: 'area-1', name: 'Metro Cebu', slug: 'metro-cebu', city: 'Cebu City', province: 'Cebu', region: 'Region VII',
      zipCodes: [], centerLat: 10.3157, centerLng: 123.8854, radiusKm: 25, status: 'active', launchDate: null,
      launchedAt: '2026-08-01T00:00:00.000Z', minProvidersToLaunch: 5, activeProviderCount: 5,
      activeCustomerCount: 20, totalBookings: 15, isDefault: false, createdAt: '2026-08-01T00:00:00.000Z',
    }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } } } as never;
  });
  vi.mocked(api.post).mockReset().mockResolvedValue({ data: { success: true, data: { notifiedCount: 2 } } } as never);
});

it('Bug UX-787 — super admins can retry accountable waitlist notices and see the remaining-contact boundary', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><ServiceAreasPage /></MemoryRouter></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Retry waitlist notices for Metro Cebu' }));
  expect(screen.getByText(/entries without an onService account remain awaiting manual contact/i)).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Notification reason' }), {
    target: { value: 'Retrying after the launch notification queue was checked.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send notices' }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/v1/admin/service-areas/area-1/notify-waitlist', {
    reason: 'Retrying after the launch notification queue was checked.',
  }));
  expect(await screen.findByRole('status')).toHaveTextContent(/2 registered waitlist accounts notified/i);
  expect(screen.getByRole('status')).toHaveTextContent(/remain awaiting contact/i);
});
