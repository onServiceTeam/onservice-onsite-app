import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn(), patch: vi.fn() },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Request failed',
}));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ abTestingEnabled: false }) }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => {
      const [params, setParams] = React.useState(new URLSearchParams('tab=quality'));
      const updateParams = (update: URLSearchParams | ((current: URLSearchParams) => URLSearchParams)): void => {
        setParams((current) => typeof update === 'function' ? update(current) : update);
      };
      return [params, updateParams];
    },
  };
});

import AnalyticsPage from '../AnalyticsPage';

it('Bug UX-825 — quality evidence pagination requests and identifies the selected result page', async () => {
  apiGet.mockResolvedValue({ data: { data: [], pagination: { total: 26, totalPages: 2 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AnalyticsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  const nextPage = await screen.findByRole('button', { name: 'Next page' });
  fireEvent.click(nextPage);

  await waitFor(() => {
    expect(apiGet).toHaveBeenCalledWith('/api/v1/admin/analytics/quality-scores', {
      params: { sortBy: 'overall', page: 2, pageSize: 25 },
    });
  });
  expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
});
