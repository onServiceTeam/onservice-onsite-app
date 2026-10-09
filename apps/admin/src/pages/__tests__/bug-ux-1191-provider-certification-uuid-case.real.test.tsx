import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const CERTIFICATION_ID = '11910000-0000-4abc-8def-000000001191';
vi.mock('@/lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getErrorMessage: () => 'Request failed',
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'admin-1', role: 'super_admin' } }),
}));

import { CertificationsTab, type ProviderCertification } from '../ProviderDetailPage';

it('Bug UX-1191 - a valid uppercase certification UUID resolves to the canonical exact credential', () => {
  const certification: ProviderCertification = {
    id: CERTIFICATION_ID,
    name: 'Canonical TESDA credential',
    issuingBody: 'TESDA',
    certificateNumber: null,
    issuedDate: '2025-01-01',
    expiryDate: '2030-01-01',
    isVerified: true,
    verifiedAt: '2026-09-03T13:10:00.000Z',
    hasDocument: true,
    documentUrl: '/private/certificate',
    createdAt: '2025-01-01T00:00:00.000Z',
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <CertificationsTab
        providerId="provider-1"
        certifications={[certification]}
        exactCertificationId={CERTIFICATION_ID.toUpperCase()}
      />
    </QueryClientProvider>,
  );

  expect(screen.getByText('Exact certification evidence')).toBeVisible();
  expect(screen.getByText('Canonical TESDA credential').closest('[aria-current="true"]')).not.toBeNull();
  expect(screen.queryByText(/No substitute certification is shown/i)).not.toBeInTheDocument();
});
