import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import SupportTicketsPage from '../SupportTicketsPage';

it('Bug UX-700 — a failed whole-queue summary is shown as unavailable instead of four false zero signals', async () => {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/support-tickets/summary') throw new Error('Summary unavailable');
    if (url === '/api/v1/support-tickets/agents') return { data: { data: [] } } as never;
    return { data: { data: [], meta: { total: 0 } } } as never;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><SupportTicketsPage /></QueryClientProvider>);

  expect(await screen.findByText('Whole-queue support signals could not be loaded. No zero counts are being inferred.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry queue signals' })).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Support queue signals' })).toBeNull();
});
