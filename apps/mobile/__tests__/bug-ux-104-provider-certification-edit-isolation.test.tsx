import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockLaunchImageLibrary = jest.fn().mockResolvedValue({
  canceled: false,
  assets: [{ uri: 'blob:https://app.onservice.ph/replacement-photo' }],
});

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibrary(...args),
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyCertifications: jest.fn().mockResolvedValue([
    {
      id: 'cert-1', name: 'Plumbing NC II', issuingBody: 'TESDA',
      certificateNumber: 'TESDA-100', hasDocument: true, documentUrl: '/private/cert-1',
      issuedDate: '2025-01-10', expiryDate: '2030-01-10', isVerified: true,
      verifiedAt: '2025-02-10T00:00:00.000Z', createdAt: '2025-01-10T00:00:00.000Z',
    },
    {
      id: 'cert-2', name: 'Electrical Installation NC II', issuingBody: 'TESDA',
      certificateNumber: null, hasDocument: false, documentUrl: null,
      issuedDate: '2025-03-10', expiryDate: null, isVerified: false,
      verifiedAt: null, createdAt: '2025-03-10T00:00:00.000Z',
    },
  ]),
  addCertification: jest.fn(),
  updateCertification: jest.fn(),
  removeCertification: jest.fn(),
}));
jest.mock('@/services/upload.service', () => ({ uploadImages: jest.fn() }));
jest.mock('@/components/provider/NbiStatusBanner', () => () => null);
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1366, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));

import CertificationsScreen from '../app/provider/certifications';

it('Bug UX-104 — switching certification edit targets clears the prior credential replacement photo', async () => {
  const originalPlatform = Platform.OS;
  Platform.OS = 'web';
  try {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const view = render(
      <QueryClientProvider client={client}>
        <CertificationsScreen />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(view.container.textContent).toContain('Plumbing NC II'));

    fireEvent.click(view.getByLabelText('Edit Plumbing NC II'));
    fireEvent.click(view.getByText('Replace'));
    await waitFor(() => expect(view.container.textContent).toContain('Change'));

    fireEvent.click(view.getByLabelText('Edit Electrical Installation NC II'));

    expect(view.container.textContent).not.toContain('Change');
    expect(view.container.textContent).toContain('Add certificate photo');
    expect((view.getByLabelText('Certification name') as HTMLInputElement).value)
      .toBe('Electrical Installation NC II');
  } finally {
    Platform.OS = originalPlatform;
  }
});
