import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));

import ConsentVersionsPage from '../ConsentVersionsPage';

function LocationEvidence(): React.ReactElement {
  const location = useLocation();
  return <output aria-label="Current consent workspace query">{location.search}</output>;
}

it('Bug UX-1073 — a malformed consent-publication URL is rejected locally without losing its history tab', async () => {
  apiGet.mockResolvedValue({ data: { data: {
    summaries: [],
    published: [],
    allowedConsentTypes: ['privacy_policy'],
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/consent-versions?tab=history&publicationId=not-a-uuid']}>
        <LocationEvidence />
        <ConsentVersionsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Invalid consent publication link')).toBeVisible();
  expect(apiGet).toHaveBeenCalledTimes(1);
  expect(apiGet).toHaveBeenCalledWith('/api/v1/admin/compliance/consent-versions');

  fireEvent.click(screen.getByRole('button', { name: 'Remove invalid publication link' }));

  await waitFor(() => {
    expect(screen.getByLabelText('Current consent workspace query')).toHaveTextContent('?tab=history');
  });
  expect(screen.getByLabelText('Current consent workspace query')).not.toHaveTextContent('publicationId');
  expect(apiGet).toHaveBeenCalledTimes(1);
});
