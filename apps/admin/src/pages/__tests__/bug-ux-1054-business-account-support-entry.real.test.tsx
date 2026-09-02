import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (error: unknown) => String(error) }));

import { BusinessBookingsTab } from '../BusinessAccountDetailPage';

it('Bug UX-1054 - Business Account 360 opens the exact company support view and a case owned by its owner', async () => {
  apiGet.mockResolvedValue({ data: {
    success: true,
    data: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BusinessBookingsTab
          accountId="11111111-1111-4111-8111-111111111111"
          accountName="Cebu Build Co"
          ownerUserId="22222222-2222-4222-8222-222222222222"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('link', { name: 'Open account support' })).toHaveAttribute(
    'href', '/support-tickets?businessAccountId=11111111-1111-4111-8111-111111111111&businessName=Cebu%20Build%20Co',
  );
  expect(screen.getByRole('link', { name: 'Create account case' })).toHaveAttribute(
    'href', '/support-tickets?businessAccountId=11111111-1111-4111-8111-111111111111&businessName=Cebu%20Build%20Co&userId=22222222-2222-4222-8222-222222222222&userName=Cebu%20Build%20Co&userRole=customer&new=1',
  );
});
