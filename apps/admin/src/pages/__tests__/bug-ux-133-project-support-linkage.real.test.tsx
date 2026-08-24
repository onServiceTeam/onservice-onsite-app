import { expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import api from '@/lib/api';
import ProjectsPage from '../ProjectsPage';

it('Bug UX-133 — project oversight identifies the customer and provider records while separating planning from booking and money operations', async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: {
      success: true,
      data: [{
        id: 'project-1', customerId: 'customer-1', providerId: 'provider-1',
        customerName: 'Maria Santos', providerName: 'Cebu Home Works',
        title: 'Kitchen plan', description: 'Plan the remodel', city: 'Cebu City',
        status: 'planning', estimatedTotal: 150_000, createdAt: '2026-08-24T00:00:00.000Z',
      }],
    },
  } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <MemoryRouter>
      <QueryClientProvider client={client}><ProjectsPage /></QueryClientProvider>
    </MemoryRouter>,
  );

  expect((await screen.findByText('Maria Santos')).closest('a')).toHaveAttribute('to', '/customers/customer-1');
  expect(screen.getByText('Cebu Home Works').closest('a')).toHaveAttribute('to', '/providers/provider-1');
  expect(screen.getByText(/Hiring, bookings, quotes, and money are managed in their own operational areas/i)).toBeTruthy();
  expect(screen.getByRole('table', { name: 'Customer project planning records' })).toBeTruthy();
});
