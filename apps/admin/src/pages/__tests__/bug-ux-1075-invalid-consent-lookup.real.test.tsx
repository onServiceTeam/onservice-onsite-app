import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

const apiGet = vi.hoisted(() => vi.fn((url: string) => {
  if (url.includes('dsr-alerts')) return Promise.resolve({ data: { data: [] } });
  return Promise.reject(new Error(`Unexpected consent request: ${url}`));
}));

vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
  getErrorMessage: (error: Error) => error.message,
}));

import PrivacyWorkspacePage from '../PrivacyWorkspacePage';

function LocationEvidence(): React.ReactElement {
  const location = useLocation();
  return <output aria-label="Current privacy query">{location.search}</output>;
}

it('Bug UX-1075 — a malformed saved consent lookup is rejected locally and can be removed safely', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/privacy?consentUserId=not-a-uuid&consentPage=4']}>
        <LocationEvidence />
        <PrivacyWorkspacePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText(/saved consent lookup ID is invalid/i)).toBeVisible();
  expect(apiGet.mock.calls.filter(([url]) => String(url).endsWith('/consent'))).toHaveLength(0);

  fireEvent.click(screen.getByRole('button', { name: 'Remove invalid lookup' }));
  await waitFor(() => expect(screen.getByLabelText('Current privacy query')).toBeEmptyDOMElement());
  expect(screen.getByLabelText('User ID for consent lookup')).toHaveValue('');
  expect(apiGet.mock.calls.filter(([url]) => String(url).endsWith('/consent'))).toHaveLength(0);
});
