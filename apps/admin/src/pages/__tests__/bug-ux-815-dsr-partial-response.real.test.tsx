import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { data: {} } }), post: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'dpo' } }),
}));

import DataProtectionLogPage from '../DataProtectionLogPage';

it('Bug UX-815 — a partial DSR list response does not crash the privacy workspace', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}><DataProtectionLogPage /></QueryClientProvider>
    </MemoryRouter>,
  );

  expect(await screen.findByText('No matching data requests')).toBeVisible();
});
