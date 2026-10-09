import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getErrorMessage: () => 'Request failed',
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'admin-1', role: 'super_admin' } }),
}));

import { CertificationsTab, type ProviderCertification } from '../ProviderDetailPage';

const credential: ProviderCertification = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Electrical Installation NC II',
  issuingBody: 'TESDA',
  certificateNumber: null,
  issuedDate: null,
  expiryDate: null,
  isVerified: false,
  verifiedAt: null,
  hasDocument: true,
  documentUrl: '/private/certificate',
  createdAt: '2025-01-01T00:00:00.000Z',
};

it('Bug UX-1144 — Provider 360 shows no substitute when a valid certification evidence ID is absent from the provider record', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CertificationsTab
        providerId="provider-1"
        certifications={[credential]}
        exactCertificationId="dddddddd-dddd-4ddd-8ddd-dddddddddddd"
      />
    </QueryClientProvider>,
  );

  expect(screen.getByRole('alert')).toHaveTextContent('No substitute certification is shown');
  expect(screen.queryByText('Electrical Installation NC II')).not.toBeInTheDocument();
  expect(screen.queryByText('Exact certification evidence')).not.toBeInTheDocument();
});
