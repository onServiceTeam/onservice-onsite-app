import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks }));

import CustomersPage from '../CustomersPage';

it('Bug UX-490 — customer queue renders masked identity, independent account/risk state, and canonical booking/support workload exits', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: {
    success: true,
    summary: { totalCustomers: 12, activeAccounts: 10, inactiveAccounts: 2, fraudFlagged: 1 },
    data: [{
      id: 'customer-1', phone: '+63 9XX XXX 4567', email: 'a•••@example.com', firstName: 'Ana', lastName: 'Reyes',
      status: 'flag_fraud', isActive: true, isFlaggedFraud: true, contactMasked: true,
      totalBookings: 4, totalSpent: 125000, activeBookings: 1, totalDisputes: 2,
      openDisputes: 1, openSupportTickets: 1, createdAt: '2026-08-30T01:00:00.000Z',
    }],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><CustomersPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Ana Reyes')).toHaveAttribute('to', '/customers/customer-1');
  expect(screen.getByText('+63 9XX XXX 4567')).toBeVisible();
  expect(screen.queryByText('+639171234567')).not.toBeInTheDocument();
  expect(screen.getAllByText('Active')).toHaveLength(2);
  expect(screen.getAllByText('Fraud review')).toHaveLength(3);
  expect(screen.getByText('1 active')).toBeVisible();
  expect(screen.getByText('View bookings')).toHaveAttribute('to', '/bookings?search=customer-1');
  expect(screen.getByText('1 support case')).toHaveAttribute(
    'to',
    '/support-tickets?userId=customer-1&userName=Ana%20Reyes&userRole=customer',
  );
  expect(screen.getByRole('option', { name: 'Inactive (includes suspended)' })).toBeVisible();
  expect(screen.queryByRole('option', { name: 'Suspended' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Fraud review/ })).toHaveTextContent('1');
});
