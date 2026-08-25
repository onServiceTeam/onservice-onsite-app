import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('Bug UX-413 — score recomputation identifies every replaced evidence dimension before mutation', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AnalyticsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Recompute Scores' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(
      screen.getByText(/rating, completion, timeliness, cancellation, and response evidence/i),
    ).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Recompute scores' }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/api/v1/admin/analytics/quality-scores/compute',
        { periodDays: 90 },
      );
    });
  });
});
