import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const USER_ID = '12110000-abcd-4abc-8def-000000001211';
const apiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import PrivacyWorkspacePage from '../PrivacyWorkspacePage';

function LocationEvidence(): React.ReactElement {
  const location = useLocation();
  return <output aria-label="Current canonical consent query">{location.search}</output>;
}

it('Bug UX-1211 - a submitted uppercase consent-user UUID is stored and requested canonically', async () => {
  apiGet.mockImplementation((url: string, config?: { params?: { userId?: string } }) => {
    if (url.includes('dsr-alerts')) return Promise.resolve({ data: { data: [] } });
    if (url === '/api/v1/admin/compliance/consent' && config?.params?.userId === USER_ID) {
      return Promise.resolve({ data: { data: { rows: [{
        id: 'consent-submitted',
        userId: USER_ID,
        consentType: 'terms_of_service',
        version: 'submitted-4.0',
        granted: true,
        grantedAt: '2026-09-04T00:00:00.000Z',
        revokedAt: null,
      }], total: 1 } } });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/privacy']}>
        <LocationEvidence />
        <PrivacyWorkspacePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.change(screen.getByLabelText('User ID for consent lookup'), {
    target: { value: USER_ID.toUpperCase() },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search consent records' }));

  expect(await screen.findByText('submitted-4.0')).toBeVisible();
  expect(apiGet).toHaveBeenCalledWith(
    '/api/v1/admin/compliance/consent',
    expect.objectContaining({ params: expect.objectContaining({ userId: USER_ID, offset: 0 }) }),
  );
  await waitFor(() => {
    expect(screen.getByLabelText('Current canonical consent query')).toHaveTextContent(
      `?consentUserId=${USER_ID}`,
    );
  });
});
