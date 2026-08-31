import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ promoRedemptionEnabled: false, abTestingEnabled: false }),
}));

import AnalyticsPage from '../AnalyticsPage';

it('Bug 286 — the admin does not expose A/B controls while assignment and exposure reporting are held', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AnalyticsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(screen.queryByRole('tab', { name: 'A/B Tests' })).not.toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Cohort Analysis' })).toBeInTheDocument();
});
