import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { post } = vi.hoisted(() => ({ post: vi.fn().mockResolvedValue({ data: { success: true } }) }));
vi.mock('@/lib/api', () => ({
  default: { post, get: vi.fn() },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));

import { CertificationsTab, type ProviderCertification } from '../ProviderDetailPage';

const credential: ProviderCertification = {
  id: 'cert-1',
  name: 'Electrical Installation NC II',
  issuingBody: 'TESDA',
  certificateNumber: 'TESDA-42',
  issuedDate: '2025-01-01',
  expiryDate: '2030-01-01',
  isVerified: false,
  verifiedAt: null,
  hasDocument: true,
  documentUrl: '/api/v1/admin/providers/provider-1/certifications/cert-1/document',
  createdAt: '2025-01-01T00:00:00.000Z',
};

describe('Provider 360 certification review', () => {
  it('Bug UX-099 — admin sees private evidence and can verify the provider-scoped credential from Provider 360', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const view = render(
      <QueryClientProvider client={client}>
        <CertificationsTab providerId="provider-1" certifications={[credential]} />
      </QueryClientProvider>,
    );

    expect(view.container.textContent).toContain('Awaiting review');
    expect(view.container.textContent).toContain('Electrical Installation NC II');
    expect(view.container.textContent).toContain('Private certificate photo');
    expect(view.getByText('view')).toBeTruthy();

    const verifyButton = view.getByText('Verify').closest('button');
    expect(verifyButton?.className).toContain('min-h-11');
    fireEvent.click(verifyButton!);
    await waitFor(() => expect(post).toHaveBeenCalledWith(
      '/api/v1/admin/providers/provider-1/certifications/cert-1/review',
      { isVerified: true, reason: undefined },
    ));
  });
});
