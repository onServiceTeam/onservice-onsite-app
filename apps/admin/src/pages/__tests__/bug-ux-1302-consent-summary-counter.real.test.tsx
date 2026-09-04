import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn().mockResolvedValue({
  data: { data: { summaries: [], published: [], allowedConsentTypes: ['privacy_policy'] } },
}));

vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));

import ConsentVersionsPage from '../ConsentVersionsPage';

it('Bug UX-1302 - consent publication shows the trimmed change-summary length before submission', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}><ConsentVersionsPage /></QueryClientProvider>
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Publish a new consent version' }));
  expect(screen.getByText('0/30 characters')).toBeVisible();

  fireEvent.change(screen.getByLabelText('Change summary'), {
    target: { value: '  Twelve chars' },
  });
  expect(screen.getByText('12/30 characters')).toBeVisible();
});
