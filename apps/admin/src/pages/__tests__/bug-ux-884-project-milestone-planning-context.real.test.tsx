import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (error: unknown) => String(error) }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import ProjectsPage from '../ProjectsPage';

it('Bug UX-884 — Admin project oversight renders the milestone scope and target date returned by the planning record', async () => {
  apiGet.mockImplementation(async (url: string) => url === '/api/v1/projects' ? ({ data: { success: true, data: [{
    id: 'project-1', customerId: 'customer-1', providerId: null, customerName: 'Maria Santos', providerName: null,
    title: 'Kitchen plan', description: 'Plan the remodel', city: 'Cebu City', status: 'planning', estimatedTotal: 150000,
    createdAt: '2026-08-24T00:00:00.000Z',
  }] } } as never) : ({ data: { success: true, data: {
    id: 'project-1', customerId: 'customer-1', providerId: null, customerName: 'Maria Santos', providerName: null,
    title: 'Kitchen plan', description: 'Plan the remodel', city: 'Cebu City', status: 'planning', estimatedTotal: 150000,
    createdAt: '2026-08-24T00:00:00.000Z', milestones: [{
      id: 'milestone-1', title: 'Approve cabinet layout', description: 'Confirm measurements before ordering',
      status: 'in_progress', amount: null, targetDate: '2026-09-15',
    }], selections: [], documents: [],
  } } } as never));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><ProjectsPage /></MemoryRouter></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Review milestones, choices, and documents' }));

  expect(await screen.findByText('Confirm measurements before ordering')).toBeInTheDocument();
  expect(screen.getByText('Target date: 2026-09-15')).toBeInTheDocument();
});
