import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (error: Error) => error.message }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return { ...actual, useParams: () => ({ id: 'customer-1' }) };
});

import CustomerDetailPage from '../CustomerDetailPage';

it('Bug UX-1277 - a failed Customer 360 profile load offers in-place recovery before showing customer context', async () => {
  apiGet
    .mockRejectedValueOnce(new Error('customer profile source offline'))
    .mockResolvedValueOnce({ data: { success: true, data: {
      id: 'customer-1', firstName: 'Ana', lastName: 'Reyes', fullName: 'Ana Reyes',
      phone: '+639170000000', email: 'ana@example.test', contactMasked: false, avatarUrl: null,
      isVerified: true, isActive: true, isFlaggedFraud: false, lastLoginAt: null,
      createdAt: '2026-09-01T00:00:00.000Z', lifetimeBookings: 0, lifetimeSpent: 0,
      activeBookings: 0, openDisputes: 0, averageRatingGiven: null, totalReviewsGiven: 0,
      addresses: [], sukiProviders: [],
    } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/customers/customer-1']}><Routes><Route path="/customers/:id" element={<CustomerDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByRole('heading', { name: 'Failed to load customer' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry customer' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('Ana Reyes')).toBeInTheDocument();
});
