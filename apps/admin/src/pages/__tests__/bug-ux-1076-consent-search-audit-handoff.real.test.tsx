import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

const { SUBJECT_ID, OPERATOR_ID, apiGet } = vi.hoisted(() => ({
  SUBJECT_ID: '11111111-1111-4111-8111-111111111111',
  OPERATOR_ID: '22222222-2222-4222-8222-222222222222',
  apiGet: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import AuditLogPage from '../AuditLogPage';
import PrivacyWorkspacePage from '../PrivacyWorkspacePage';

function LocationEvidence(): React.ReactElement {
  const location = useLocation();
  return <output aria-label="Current audited consent query">{location.search}</output>;
}

it('Bug UX-1076 — an audited exact consent search reopens the searched subject instead of the fallback operator', async () => {
  apiGet.mockImplementation((url: string, config?: { params?: { userId?: string } }) => {
    if (url === '/api/v1/admin/audit-log') {
      return Promise.resolve({ data: {
        data: [{
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          source: 'admin_actions',
          userId: OPERATOR_ID,
          userEmail: 'd***@o***',
          userRole: 'dpo',
          targetUserRole: 'dpo',
          action: 'consent_search',
          entityType: 'user',
          entityId: OPERATOR_ID,
          oldValues: null,
          newValues: { filters: { userId: SUBJECT_ID, consentType: null, version: null }, resultCount: 1 },
          ipAddress: null,
          userAgent: null,
          reason: `DPO consent search: userId=${SUBJECT_ID}`,
          createdAt: '2026-09-03T10:00:00.000Z',
        }],
        pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
      } });
    }
    if (url.includes('dsr-alerts')) return Promise.resolve({ data: { data: [] } });
    if (url === '/api/v1/admin/compliance/consent' && config?.params?.userId === SUBJECT_ID) {
      return Promise.resolve({ data: { data: { rows: [{
        id: 'consent-1',
        userId: SUBJECT_ID,
        consentType: 'privacy_policy',
        version: '3.0',
        granted: true,
        grantedAt: '2026-09-03T00:00:00.000Z',
        revokedAt: null,
      }], total: 1 } } });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const handoffRender = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/audit-log']}>
        <LocationEvidence />
        <Routes>
          <Route path="/audit-log" element={<AuditLogPage />} />
          <Route path="/privacy" element={<PrivacyWorkspacePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect((await screen.findAllByText('Consent evidence searched')).length).toBeGreaterThan(0);
  const destination = `/privacy?consentUserId=${SUBJECT_ID}`;
  const destinationLink = handoffRender.container.querySelector(`a[href="${destination}"]`);
  expect(destinationLink).not.toBeNull();
  expect(handoffRender.container.querySelector(`a[href="/staff?search=${OPERATOR_ID}"]`)).toBeNull();
  fireEvent.click(destinationLink!);

  expect(await screen.findByText('3.0')).toBeVisible();
  expect(screen.getByLabelText('User ID for consent lookup')).toHaveValue(SUBJECT_ID);
  expect(screen.getByLabelText('Current audited consent query')).toHaveTextContent(`?consentUserId=${SUBJECT_ID}`);
  expect(apiGet).toHaveBeenCalledWith(
    '/api/v1/admin/compliance/consent',
    expect.objectContaining({ params: expect.objectContaining({ userId: SUBJECT_ID, offset: 0 }) }),
  );
});
