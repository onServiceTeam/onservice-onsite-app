import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (error: unknown) => String(error) }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import ProjectsPage from '../ProjectsPage';

function LocationProbe(): React.ReactElement {
  const location = useLocation();
  return <output aria-label="Current project discovery URL">{location.search}</output>;
}

it('Bug UX-886 — Admin project search, status, and pagination stay server-backed and reproducible in the handoff URL', async () => {
  apiGet.mockResolvedValue({ data: {
    success: true,
    data: [{
      id: 'project-21', customerId: 'customer-1', providerId: 'provider-1', customerName: 'Jose Ramos', providerName: 'Ramos Builders',
      title: 'Roof plan', description: 'Inspect the second result page', city: 'Mandaue City', status: 'active', estimatedTotal: null,
      createdAt: '2026-08-24T00:00:00.000Z',
    }],
    summary: { totalProjects: 41, activeProjects: 41, legacyProviderLinks: 8 },
    pagination: { page: 2, pageSize: 20, total: 41, totalPages: 3 },
  } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/projects?source=support&search=Ramos&status=active&page=2']}>
        <ProjectsPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Roof plan')).toBeInTheDocument();
  expect(apiGet).toHaveBeenCalledWith('/api/v1/admin/projects', { params: {
    page: 2, pageSize: 20, status: 'active', search: 'Ramos',
  } });
  expect(within(screen.getByLabelText('Project planning summary')).getAllByText('41')).toHaveLength(2);

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));

  await waitFor(() => {
    const search = screen.getByLabelText('Current project discovery URL').textContent ?? '';
    expect(search).toContain('source=support');
    expect(search).toContain('search=Ramos');
    expect(search).toContain('status=active');
    expect(search).toContain('page=3');
  });
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/v1/admin/projects', { params: {
    page: 3, pageSize: 20, status: 'active', search: 'Ramos',
  } }));
});
