import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import api from '@/lib/api';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams('tab=quality'), vi.fn()],
  };
});

import AnalyticsPage from '../AnalyticsPage';

describe('provider quality recomputation', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset().mockImplementation(async (url: string) => {
      if (url === '/api/v1/config') {
        return {
          data: { data: { featureFlags: { promoRedemptionEnabled: false, abTestingEnabled: false } } },
        } as never;
      }
      return {
        data: { data: [], pagination: { total: 0 } },
      } as never;
    });
    vi.mocked(api.post).mockReset().mockResolvedValue({ data: { success: true } } as never);
  });

  it('Bug UX-413 — conflicting quality definitions hold recomputation instead of replacing provider snapshots', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AnalyticsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/E47 holds recomputation/)).toBeInTheDocument();
    expect(screen.getByText(/rating 30%, completion 25%/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /recompute/i })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
