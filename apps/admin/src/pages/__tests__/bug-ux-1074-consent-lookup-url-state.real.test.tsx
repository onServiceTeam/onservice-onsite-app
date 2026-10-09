import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

const { USER_ID, apiGet } = vi.hoisted(() => ({
  USER_ID: '11111111-1111-4111-8111-111111111111',
  apiGet: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
  getErrorMessage: (error: Error) => error.message,
}));

import PrivacyWorkspacePage from '../PrivacyWorkspacePage';

function LocationEvidence(): React.ReactElement {
  const location = useLocation();
  return <output aria-label="Current consent lookup query">{location.search}</output>;
}

it('Bug UX-1074 — an exact consent lookup and its evidence page survive refresh and pagination', async () => {
  apiGet.mockImplementation((url: string, config?: { params?: { offset?: number } }) => {
    if (url.includes('dsr-alerts')) return Promise.resolve({ data: { data: [] } });
    const offset = config?.params?.offset ?? 0;
    return Promise.resolve({ data: { data: {
      rows: [{
        id: offset === 100 ? 'consent-101' : 'consent-1',
        userId: USER_ID,
        consentType: 'privacy_policy',
        version: offset === 100 ? 'v101' : 'v1',
        granted: true,
        grantedAt: '2026-09-02T00:00:00.000Z',
        revokedAt: null,
      }],
      total: 101,
    } } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/privacy?consentUserId=${USER_ID}&consentPage=2`]}>
        <LocationEvidence />
        <PrivacyWorkspacePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('v101')).toBeVisible();
  expect(screen.getByLabelText('User ID for consent lookup')).toHaveValue(USER_ID);
  expect(apiGet).toHaveBeenCalledWith(
    '/api/v1/admin/compliance/consent',
    expect.objectContaining({ params: expect.objectContaining({ userId: USER_ID, limit: 100, offset: 100 }) }),
  );
  expect(screen.getByLabelText('Current consent lookup query')).toHaveTextContent(
    `?consentUserId=${USER_ID}&consentPage=2`,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await waitFor(() => {
    expect(screen.getByLabelText('Current consent lookup query')).toHaveTextContent(`?consentUserId=${USER_ID}`);
  });
  expect(screen.getByLabelText('Current consent lookup query')).not.toHaveTextContent('consentPage');
  expect(apiGet).toHaveBeenCalledWith(
    '/api/v1/admin/compliance/consent',
    expect.objectContaining({ params: expect.objectContaining({ userId: USER_ID, limit: 100, offset: 0 }) }),
  );
});
