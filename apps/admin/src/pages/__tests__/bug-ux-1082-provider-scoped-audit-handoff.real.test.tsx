import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const PROVIDER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CERT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOTE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const REVIEW_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'admin-1', role: 'super_admin' } }),
}));

import AuditLogPage from '../AuditLogPage';
import ProviderDetailPage from '../ProviderDetailPage';

it('Bug UX-1082 — provider-scoped audit targets reopen the correct durable Provider 360 workspace', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/audit-log') {
      return { data: { success: true, data: [
        {
          id: '11111111-1111-4111-8111-111111111111', source: 'admin_actions',
          userId: 'admin-1', userEmail: 'ad***@example.com', userRole: 'super_admin',
          action: 'provider_certification_verified', entityType: 'provider_certification', entityId: CERT_ID,
          oldValues: null, newValues: { providerId: PROVIDER_ID }, ipAddress: null, userAgent: null,
          reason: 'Evidence checked', createdAt: '2026-09-03T03:00:00.000Z',
        },
        {
          id: '22222222-2222-4222-8222-222222222222', source: 'admin_actions',
          userId: 'admin-1', userEmail: 'ad***@example.com', userRole: 'super_admin',
          action: 'provider_note_updated', entityType: 'provider_note', entityId: NOTE_ID,
          oldValues: null, newValues: { providerId: PROVIDER_ID }, ipAddress: null, userAgent: null,
          reason: 'Support note updated', createdAt: '2026-09-03T02:00:00.000Z',
        },
        {
          id: '33333333-3333-4333-8333-333333333333', source: 'admin_actions',
          userId: 'admin-1', userEmail: 'ad***@example.com', userRole: 'super_admin',
          action: 'review_visibility_changed', entityType: 'review', entityId: REVIEW_ID,
          oldValues: null, newValues: { providerId: PROVIDER_ID }, ipAddress: null, userAgent: null,
          reason: 'Moderation review', createdAt: '2026-09-03T01:00:00.000Z',
        },
      ], pagination: { page: 1, pageSize: 25, total: 3, totalPages: 1 } } };
    }
    if (url === `/api/v1/admin/providers/${PROVIDER_ID}/profile`) {
      return { data: { success: true, data: {
        id: PROVIDER_ID, userId: 'provider-user-1', businessName: 'Cebu Cleaners', description: '',
        tier: 'verified', status: 'approved', averageRating: 4.8, totalReviews: 10,
        totalJobsCompleted: 30, serviceRadiusKm: 20, yearsExperience: null, vettingAnswers: null,
        city: 'Cebu City', province: 'Cebu', latitude: null, longitude: null,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
        user: { id: 'provider-user-1', fullName: 'Ramil Santos', phone: 'masked', email: null,
          contactMasked: true, avatarUrl: null, isVerified: true, isActive: true, lastLoginAt: null },
        documents: {}, categories: [], services: [], serviceAreas: [], certifications: [{
          id: CERT_ID, name: 'Electrical Installation NC II', issuingBody: 'TESDA',
          certificateNumber: 'TESDA-42', issuedDate: '2025-01-01', expiryDate: '2030-01-01',
          isVerified: true, verifiedAt: '2026-08-01T00:00:00.000Z', hasDocument: true,
          documentUrl: '/private/certificate', createdAt: '2025-01-01T00:00:00.000Z',
        }], portfolio: [],
      } } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/audit-log']}>
        <Routes>
          <Route path="/audit-log" element={<AuditLogPage />} />
          <Route path="/providers/:id" element={<ProviderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  const certificationLink = await screen.findByRole('link', { name: /Open exact provider certification/ });
  expect(certificationLink).toHaveAttribute('href', `/providers/${PROVIDER_ID}?tab=certifications&certificationId=${CERT_ID}`);
  expect(screen.getByRole('link', { name: /Open exact provider note context/ })).toHaveAttribute(
    'href',
    `/providers/${PROVIDER_ID}?tab=notes&noteId=${NOTE_ID}`,
  );
  expect(screen.getByRole('link', { name: /Open exact provider review evidence/ })).toHaveAttribute(
    'href',
    `/providers/${PROVIDER_ID}?tab=reviews&reviewId=${REVIEW_ID}`,
  );

  fireEvent.click(certificationLink);
  expect(await screen.findByRole('tab', { name: 'Certifications' })).toHaveAttribute('data-state', 'active');
  expect(screen.getByText('Exact certification evidence')).toBeVisible();
  expect(screen.getByText('Electrical Installation NC II')).toBeVisible();
});
