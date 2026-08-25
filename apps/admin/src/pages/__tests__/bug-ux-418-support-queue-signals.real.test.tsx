import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';

const setSearchParamsMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const ReactModule = await import('react');
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams(), setSearchParamsMock],
    Link: ({ children, ...props }: { children: React.ReactNode }) =>
      ReactModule.createElement('a', props, children),
  };
});

import SupportTicketsPage from '../SupportTicketsPage';

it('Bug UX-418 — support signals use queue-wide totals and open the matching active-case filter', async () => {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/support-tickets/summary') {
      return { data: { data: { open: 7, escalated: 2, urgent: 3, unassigned: 4 } } } as never;
    }
    if (url === '/api/v1/support-tickets/agents') return { data: { data: [] } } as never;
    return { data: { data: [], meta: { total: 0 } } } as never;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><SupportTicketsPage /></QueryClientProvider>);

  const signals = await screen.findByRole('region', { name: 'Support queue signals' });
  expect(await within(signals).findByRole('button', { name: /Open across queue 7/ })).toBeTruthy();
  const unassigned = await within(signals).findByRole('button', { name: /Unassigned across queue 4/ });
  fireEvent.click(unassigned);

  const updater = setSearchParamsMock.mock.calls.at(-1)?.[0] as (current: URLSearchParams) => URLSearchParams;
  const next = updater(new URLSearchParams('status=closed&page=3'));
  expect(next.get('unassigned')).toBe('1');
  expect(next.get('active')).toBe('1');
  expect(next.has('status')).toBe(false);
  expect(next.has('page')).toBe(false);
});
