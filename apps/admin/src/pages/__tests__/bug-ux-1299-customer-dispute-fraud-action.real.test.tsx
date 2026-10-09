import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: (error: Error) => error.message }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) =>
    selector({ user: { role: 'super_admin' } }),
}));

import { DisputesTab } from '../CustomerDetailPage';

it('Bug UX-1299 - the Customer 360 disputes tab offers a reasoned fraud-review action for super-admins', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: {
    rows: [], total: 0, page: 1, pageSize: 20,
    fraudPattern: {
      disputesInWindow: 3, windowDays: 30, favorProviderRate: 0.67,
      flagged: true, reason: 'Three provider-favored disputes were filed within the review window.',
    },
  } } });
  apiMocks.put.mockResolvedValueOnce({ data: { success: true, data: { isActive: true } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><DisputesTab customerId="customer-1" /></MemoryRouter></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Flag for fraud review' }));
  const reason = await screen.findByLabelText('Fraud-review reason');
  fireEvent.change(reason, { target: { value: 'Three linked provider-favored disputes require manual review.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Flag for review' }));

  await waitFor(() => expect(apiMocks.put).toHaveBeenCalledWith(
    '/api/v1/admin/customers/customer-1/status',
    { action: 'flag_fraud', reason: 'Three linked provider-favored disputes require manual review.' },
  ));
  expect(await screen.findByText('Customer added to the internal fraud-review queue.')).toBeVisible();
});
