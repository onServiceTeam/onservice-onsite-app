import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));

import DataProtectionLogPage from '../DataProtectionLogPage';

it('Bug UX-817 — an operations admin sees the privacy restriction without a false empty queue', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}><DataProtectionLogPage /></QueryClientProvider>
    </MemoryRouter>,
  );

  expect(screen.getByRole('alert')).toHaveTextContent(/restricted to the appointed Data Protection Officer/i);
  expect(screen.queryByText('No matching data requests')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Case filters' })).not.toBeInTheDocument();
  expect(apiGet).not.toHaveBeenCalled();
});
