import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import api from '@/lib/api';
import ServiceAreasPage from '../ServiceAreasPage';

describe('service-area activation', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset().mockImplementation(async (url: string) => {
      if (url.endsWith('/stats')) {
        return {
          data: {
            success: true,
            data: {
              totalAreas: 1,
              activeAreas: 0,
              totalProviders: 5,
              totalWaitlist: 12,
              areasByStatus: { recruiting: 1 },
            },
          },
        } as never;
      }
      if (url.endsWith('/service-area-changes')) {
        return { data: { success: true, data: [] } } as never;
      }
      return {
        data: {
          success: true,
          data: [
            {
              id: 'area-1',
              name: 'Metro Cebu',
              slug: 'metro-cebu',
              city: 'Cebu City',
              province: 'Cebu',
              region: 'Region VII',
              zipCodes: [],
              centerLat: 10.3157,
              centerLng: 123.8854,
              radiusKm: 25,
              status: 'recruiting',
              launchDate: null,
              launchedAt: null,
              minProvidersToLaunch: 5,
              activeProviderCount: 5,
              activeCustomerCount: 20,
              totalBookings: 0,
              isDefault: true,
              createdAt: '2026-08-25T00:00:00.000Z',
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        },
      } as never;
    });
    vi.mocked(api.post).mockReset().mockResolvedValue({ data: { success: true } } as never);
  });

  it('Bug UX-410 — activation explains customer, provider, capacity, and waitlist effects before mutation', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ServiceAreasPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Activate service area Metro Cebu' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/customer bookings and provider matching/i)).toBeTruthy();
    expect(screen.getByText(/5 approved providers.*minimum of 5/i)).toBeTruthy();
    expect(screen.getByText(/registered waitlist users with accounts.*in-app notice/i)).toBeTruthy();
    expect(screen.getByText(/other entries remain awaiting contact/i)).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Activation reason' }), {
      target: { value: 'Provider capacity and launch operations have been reviewed.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Activate area' }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/v1/admin/service-areas/area-1/activate', {
        reason: 'Provider capacity and launch operations have been reviewed.',
      });
    });
  });
});
