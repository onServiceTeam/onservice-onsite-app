import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (error: unknown) => String(error) }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import { MembersTab } from '../BusinessAccountDetailPage';

it('Bug UX-667 — each business member opens the canonical Customer 360 record', async () => {
  apiGet.mockResolvedValue({ data: { success: true, data: [{
    id: 'member-1', userId: 'customer-1', role: 'manager', canBook: true, canApprove: true, canViewInvoices: true,
    firstName: 'Ana', lastName: 'Reyes', email: 'ana@example.com', createdAt: '2026-08-01T00:00:00.000Z',
  }] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><MembersTab accountId="business-1" /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByRole('link', { name: 'Ana Reyes' })).toHaveAttribute('href', '/customers/customer-1');
});
