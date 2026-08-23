import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const privateDocumentPath = '/api/v1/providers/me/certifications/cert-1/document';

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyCertifications: jest.fn().mockResolvedValue([{
    id: 'cert-1', name: 'Plumbing NC II', issuingBody: 'TESDA',
    certificateNumber: 'TESDA-100', hasDocument: true,
    documentUrl: privateDocumentPath,
    issuedDate: '2025-01-10', expiryDate: '2030-01-10',
    isVerified: true, verifiedAt: '2025-02-10T00:00:00.000Z', createdAt: '2025-01-10T00:00:00.000Z',
  }]),
  addCertification: jest.fn(),
  updateCertification: jest.fn(),
  removeCertification: jest.fn(),
}));
jest.mock('@/services/upload.service', () => ({ uploadImages: jest.fn() }));
jest.mock('@/components/provider/NbiStatusBanner', () => () => null);
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 768, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));

import CertificationsScreen from '../app/provider/certifications';

it('Bug UX-100 — editing an existing private certificate shows an on-file state without rendering its document path', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(
    <QueryClientProvider client={client}>
      <CertificationsScreen />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(view.container.textContent).toContain('Certificate photo attached'));
  expect(view.container.textContent).not.toContain(privateDocumentPath);

  fireEvent.click(view.getByLabelText('Edit Plumbing NC II'));
  expect(view.container.textContent).toContain('Certificate photo on file');
  expect(view.container.textContent).toContain('Choose a new photo to replace it');
  expect(view.container.textContent).not.toContain(privateDocumentPath);
});
