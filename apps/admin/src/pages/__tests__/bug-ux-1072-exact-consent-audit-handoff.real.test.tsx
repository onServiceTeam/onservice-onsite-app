import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

const { TARGET_ID, EVENT_ID, apiGet } = vi.hoisted(() => ({
  TARGET_ID: '11111111-1111-1111-1111-111111111111',
  EVENT_ID: '22222222-2222-2222-2222-222222222222',
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
import ConsentVersionsPage from '../ConsentVersionsPage';

function LocationEvidence(): React.ReactElement {
  const location = useLocation();
  return <output aria-label="Current consent handoff query">{location.search}</output>;
}

it('Bug UX-1072 — a super-admin audit event reopens the exact authorized consent publication', async () => {
  const publication = {
    id: EVENT_ID,
    targetId: TARGET_ID,
    consentType: 'privacy_policy',
    version: '3.0',
    effectiveAt: '2026-09-10T00:00:00.000Z',
    changeSummary: 'Approved material changes to account-data processing purposes.',
    material: true,
    publishedBy: '33333333-3333-3333-3333-333333333333',
    publishedAt: '2026-09-03T00:00:00.000Z',
  };
  apiGet.mockImplementation((url: string) => {
    if (url === '/api/v1/admin/audit-log') {
      return Promise.resolve({ data: {
        data: [{
          id: EVENT_ID,
          source: 'admin_actions',
          userId: publication.publishedBy,
          userEmail: 'd***@o***',
          userRole: 'dpo',
          action: 'consent_version_published',
          entityType: 'consent_version',
          entityId: TARGET_ID,
          oldValues: null,
          newValues: {
            consentType: publication.consentType,
            version: publication.version,
            effectiveAt: publication.effectiveAt,
            material: publication.material,
          },
          ipAddress: null,
          userAgent: null,
          reason: publication.changeSummary,
          createdAt: publication.publishedAt,
        }],
        pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
      } });
    }
    if (url === `/api/v1/admin/compliance/consent-versions/${TARGET_ID}`) {
      return Promise.resolve({ data: { data: publication } });
    }
    if (url === '/api/v1/admin/compliance/consent-versions') {
      return Promise.resolve({ data: { data: {
        summaries: [],
        published: [],
        allowedConsentTypes: ['privacy_policy'],
      } } });
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
          <Route path="/consent-versions" element={<ConsentVersionsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect((await screen.findAllByText('Consent version published')).length).toBeGreaterThan(0);
  const destination = `/consent-versions?tab=history&publicationId=${TARGET_ID}`;
  const destinationLink = handoffRender.container.querySelector(`a[href="${destination}"]`);
  expect(destinationLink).not.toBeNull();
  fireEvent.click(destinationLink!);

  expect(await screen.findByRole('heading', { name: 'privacy policy · Version 3.0' })).toBeVisible();
  expect(screen.getByText(publication.changeSummary)).toBeVisible();
  expect(screen.getByText(TARGET_ID)).toBeVisible();
  expect(screen.getByText(EVENT_ID)).toBeVisible();
  expect(screen.getByLabelText('Current consent handoff query')).toHaveTextContent(
    `?tab=history&publicationId=${TARGET_ID}`,
  );
  expect(apiGet).toHaveBeenCalledWith(`/api/v1/admin/compliance/consent-versions/${TARGET_ID}`);
});
