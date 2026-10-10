import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { ReviewsTab } from '../ProviderDetailPage';

it('Bug UX-1155 — Provider 360 rejects a malformed review evidence ID before requesting reviews', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ReviewsTab providerId="provider-1" exactReviewId="not-a-uuid" /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(screen.getByRole('alert')).toHaveTextContent('Provider review ID must be a complete UUID');
  expect(screen.queryByText('Exact provider review evidence')).not.toBeInTheDocument();
  expect(apiMocks.get).not.toHaveBeenCalled();
});
