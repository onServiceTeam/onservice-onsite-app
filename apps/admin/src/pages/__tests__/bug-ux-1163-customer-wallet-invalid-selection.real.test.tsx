import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { PaymentsTab } from '../CustomerDetailPage';

it('Bug UX-1163 — Customer 360 rejects a malformed wallet evidence ID before requesting payment records', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PaymentsTab customerId="customer-1" exactTransactionId="not-a-uuid" />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(screen.getByRole('alert')).toHaveTextContent('Wallet transaction ID must be a complete UUID');
  expect(screen.queryByText('Exact customer wallet transaction')).not.toBeInTheDocument();
  expect(apiMocks.get).not.toHaveBeenCalled();
});
