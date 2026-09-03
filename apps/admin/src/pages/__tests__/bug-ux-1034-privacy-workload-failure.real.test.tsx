import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn().mockRejectedValue(new Error('privacy source offline')) },
  getErrorMessage: (error: Error) => error.message,
}));

import PrivacyWorkspacePage from '../PrivacyWorkspacePage';

it('Bug UX-1034 — a failed privacy workload source shows unavailable counts instead of false zeroes', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><PrivacyWorkspacePage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i);
  expect(within(screen.getByLabelText('Upcoming internal target workload')).getByText('—')).toBeVisible();
  expect(within(screen.getByLabelText('Overdue internal target workload')).getByText('—')).toBeVisible();
  expect(screen.queryByText('0', { selector: 'p.text-3xl' })).not.toBeInTheDocument();
});
