import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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
  return <output aria-label="Current recovered consent query">{location.search}</output>;
}

it('Bug UX-1077 — a stale consent evidence page recovers to the final real page instead of showing a false empty result', async () => {
  apiGet.mockImplementation((url: string, config?: { params?: { offset?: number } }) => {
    if (url.includes('dsr-alerts')) return Promise.resolve({ data: { data: [] } });
    const offset = config?.params?.offset ?? 0;
    return Promise.resolve({ data: { data: {
      rows: offset === 100 ? [{
        id: 'consent-101',
        userId: USER_ID,
        consentType: 'privacy_policy',
        version: 'v101',
        granted: true,
        grantedAt: '2026-09-02T00:00:00.000Z',
        revokedAt: null,
      }] : [],
      total: 101,
    } } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/privacy?consentUserId=${USER_ID}&consentPage=4`]}>
        <LocationEvidence />
        <PrivacyWorkspacePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('v101')).toBeVisible();
  await waitFor(() => {
    expect(screen.getByLabelText('Current recovered consent query')).toHaveTextContent(
      `?consentUserId=${USER_ID}&consentPage=2`,
    );
  });
  expect(apiGet).toHaveBeenCalledWith(
    '/api/v1/admin/compliance/consent',
    expect.objectContaining({ params: expect.objectContaining({ userId: USER_ID, offset: 100 }) }),
  );
  expect(screen.queryByText('No consent records match this user ID.')).not.toBeInTheDocument();
});
