import { expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (error: unknown) => String(error) }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import ProjectsPage from '../ProjectsPage';

it('Bug UX-671 — project oversight uses a responsive accessible record with support and expandable planning evidence', async () => {
  apiGet.mockImplementation(async (url: string) => url === '/api/v1/admin/projects' ? ({ data: { success: true, data: [{
    id: 'project-1', customerId: 'customer-1', providerId: null, customerName: 'Maria Santos', providerName: null,
    title: 'Kitchen plan', description: 'Plan the remodel', city: 'Cebu City', status: 'planning', estimatedTotal: 150000,
    createdAt: '2026-08-24T00:00:00.000Z',
  }], summary: { totalProjects: 1, activeProjects: 0, legacyProviderLinks: 0 },
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } } } as never) : ({ data: { success: true, data: {
    id: 'project-1', customerId: 'customer-1', providerId: null, title: 'Kitchen plan', description: 'Plan the remodel',
    city: 'Cebu City', status: 'planning', estimatedTotal: 150000, createdAt: '2026-08-24T00:00:00.000Z',
    milestones: [{ id: 'milestone-1', title: 'Approve cabinet layout', status: 'in_progress', amount: null, targetDate: null }],
    selections: [], documents: [],
  } } } as never));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><ProjectsPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByRole('region', { name: 'Customer project planning records' })).toBeInTheDocument();
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.getByRole('link', { name: 'Open customer support cases' })).toHaveAttribute('href', '/support-tickets?userId=customer-1');
  const detailButton = screen.getByRole('button', { name: 'Review milestones, choices, and documents' });
  expect(detailButton).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(detailButton);
  expect(await screen.findByText('Approve cabinet layout')).toBeInTheDocument();
  expect(screen.getByText(/not a booking, provider assignment, quote, escrow, or payment record/i)).toBeInTheDocument();
});
