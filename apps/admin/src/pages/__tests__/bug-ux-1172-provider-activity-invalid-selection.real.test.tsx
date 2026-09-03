import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { ActivityTab } from '../ProviderDetailPage';

it('Bug UX-1172 — Provider 360 rejects a malformed admin-action ID before requesting activity', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ActivityTab providerId="provider-1" exactAdminActionId="not-a-uuid" />
    </QueryClientProvider>,
  );

  expect(screen.getByRole('alert')).toHaveTextContent('Admin action ID must be a complete UUID');
  expect(screen.queryByText('Exact provider account decision')).not.toBeInTheDocument();
  expect(apiMocks.get).not.toHaveBeenCalled();
});
