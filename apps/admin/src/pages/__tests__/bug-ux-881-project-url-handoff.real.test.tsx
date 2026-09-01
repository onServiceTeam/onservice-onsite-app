import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (error: unknown) => String(error) }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import ProjectsPage from '../ProjectsPage';

function LocationProbe(): React.ReactElement {
  const location = useLocation();
  return <output aria-label="Current project URL">{location.search}</output>;
}

it('Bug UX-881 — an admin project handoff restores the exact linked record outside the loaded list and preserves surrounding URL context', async () => {
  apiGet.mockImplementation(async (url: string) => {
    if (url === '/api/v1/projects') {
      return { data: { success: true, data: [{
        id: 'project-1', customerId: 'customer-1', providerId: null, customerName: 'Maria Santos', providerName: null,
        title: 'Kitchen plan', description: 'Plan the remodel', city: 'Cebu City', status: 'planning', estimatedTotal: 150000,
        createdAt: '2026-08-24T00:00:00.000Z',
      }] } };
    }
    if (url === '/api/v1/projects/project-2') {
      return { data: { success: true, data: {
        id: 'project-2', customerId: 'customer-2', providerId: 'provider-2', customerName: 'Jose Ramos', providerName: 'Ramos Builders',
        title: 'Roof redesign', description: 'Planning record from an older page', city: 'Mandaue City', status: 'planning', estimatedTotal: 250000,
        createdAt: '2026-07-01T00:00:00.000Z', milestones: [], selections: [], documents: [],
      } } };
    }
    return { data: { success: true, data: {
      id: 'project-1', customerId: 'customer-1', providerId: null, customerName: 'Maria Santos', providerName: null,
      title: 'Kitchen plan', description: 'Plan the remodel', city: 'Cebu City', status: 'planning', estimatedTotal: 150000,
      createdAt: '2026-08-24T00:00:00.000Z', milestones: [], selections: [], documents: [],
    } } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/projects?source=support&projectId=project-2']}>
        <ProjectsPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('region', { name: 'Linked project planning record' })).toBeInTheDocument();
  expect(await screen.findByText('Roof redesign')).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: 'Jose Ramos' })).toHaveAttribute('href', '/customers/customer-2');
  expect(apiGet).toHaveBeenCalledWith('/api/v1/projects/project-2');

  fireEvent.click(screen.getByRole('button', { name: 'Review milestones, choices, and documents' }));

  await waitFor(() => expect(screen.getByLabelText('Current project URL')).toHaveTextContent('?source=support&projectId=project-1'));
  expect(screen.queryByRole('region', { name: 'Linked project planning record' })).toBeNull();
  expect(await screen.findByText('Selected planning record')).toBeInTheDocument();
});
