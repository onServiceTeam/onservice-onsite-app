import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const USER_ID = '12100000-abcd-4abc-8def-000000001210';
const apiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import PrivacyWorkspacePage from '../PrivacyWorkspacePage';

it('Bug UX-1210 - an uppercase consent-user link requests the canonical exact subject', async () => {
  apiGet.mockImplementation((url: string, config?: { params?: { userId?: string } }) => {
    if (url.includes('dsr-alerts')) return Promise.resolve({ data: { data: [] } });
    if (url === '/api/v1/admin/compliance/consent' && config?.params?.userId === USER_ID) {
      return Promise.resolve({ data: { data: { rows: [{
        id: 'consent-linked',
        userId: USER_ID,
        consentType: 'privacy_policy',
        version: 'linked-4.0',
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
      <MemoryRouter initialEntries={[`/privacy?consentUserId=${USER_ID.toUpperCase()}`]}>
        <PrivacyWorkspacePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('linked-4.0')).toBeVisible();
  expect(apiGet).toHaveBeenCalledWith(
    '/api/v1/admin/compliance/consent',
    expect.objectContaining({ params: expect.objectContaining({ userId: USER_ID, offset: 0 }) }),
  );
});
