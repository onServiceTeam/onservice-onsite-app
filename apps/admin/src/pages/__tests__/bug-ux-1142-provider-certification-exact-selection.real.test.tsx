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

const TARGET_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function certification(id: string, name: string): ProviderCertification {
  return {
    id,
    name,
    issuingBody: 'TESDA',
    certificateNumber: null,
    issuedDate: '2025-01-01',
    expiryDate: '2030-01-01',
    isVerified: true,
    verifiedAt: '2026-08-01T00:00:00.000Z',
    hasDocument: true,
    documentUrl: '/private/certificate',
    createdAt: '2025-01-01T00:00:00.000Z',
  };
}

it('Bug UX-1142 — an exact Provider 360 certification link selects only the retained credential with that canonical ID', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CertificationsTab
        providerId="provider-1"
        certifications={[
          certification(OTHER_ID, 'Plumbing NC II'),
          certification(TARGET_ID, 'Electrical Installation NC II'),
        ]}
        exactCertificationId={TARGET_ID}
      />
    </QueryClientProvider>,
  );

  expect(screen.getByText('Exact certification evidence')).toBeVisible();
  const selectedName = screen.getByText('Electrical Installation NC II');
  expect(selectedName).toBeVisible();
  expect(selectedName.closest('[aria-current="true"]')).not.toBeNull();
  expect(screen.queryByText('Plumbing NC II')).not.toBeInTheDocument();
});
