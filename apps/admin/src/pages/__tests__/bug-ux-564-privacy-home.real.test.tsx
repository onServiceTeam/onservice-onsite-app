import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn((url: string) => {
  if (url.includes('dsr-alerts')) return Promise.resolve({ data: { data: [] } });
  return Promise.resolve({ data: { data: { rows: [] } } });
}));
vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import PrivacyWorkspacePage from '../PrivacyWorkspacePage';

it('Bug UX-564 — DPO landing page connects internal request targets and audited consent tools', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><PrivacyWorkspacePage /></MemoryRouter></QueryClientProvider>);
  expect(screen.getByRole('heading', { name: 'Privacy Workspace' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Data subject requests' }).closest('a')).toHaveAttribute('href', '/data-protection-log');
  expect(screen.getByRole('heading', { name: 'Consent versions' }).closest('a')).toHaveAttribute('href', '/consent-versions');
  expect(screen.getByLabelText('User ID for consent lookup')).toBeInTheDocument();
  expect(await screen.findAllByText('0', { selector: 'p.text-3xl' })).toHaveLength(2);
  expect(screen.queryByText(/NPC notice pending/i)).not.toBeInTheDocument();
});
