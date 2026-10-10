import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, beforeEach, it, vi } from 'vitest';

vi.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ promoRedemptionEnabled: false, abTestingEnabled: true }),
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Request failed',
}));

import api from '@/lib/api';
import AnalyticsPage from '../AnalyticsPage';

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.get.mockResolvedValue({ data: { data: [], pagination: { total: 0 } } });
  mockApi.post.mockResolvedValue({ data: { success: true } });
});

it('Bug UX-1305 — A/B draft creation collects and submits both variant names', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/analytics?tab=ab-tests']}>
        <AnalyticsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith('/api/v1/admin/analytics/ab-tests'));
  fireEvent.click(await screen.findByRole('button', { name: '+ New Test' }));

  expect(screen.getByLabelText('Variant A name')).toHaveValue('Control');
  expect(screen.getByLabelText('Variant B name')).toHaveValue('Variant B');

  fireEvent.change(screen.getByLabelText('Test name'), { target: { value: 'Checkout wording' } });
  fireEvent.change(screen.getByLabelText('Variant A name'), { target: { value: 'Current wording' } });
  fireEvent.change(screen.getByLabelText('Variant B name'), { target: { value: 'Plain-language wording' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Test' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Create draft' }));

  await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith(
    '/api/v1/admin/analytics/ab-tests',
    expect.objectContaining({
      name: 'Checkout wording',
      variantAName: 'Current wording',
      variantBName: 'Plain-language wording',
    }),
  ));
});
