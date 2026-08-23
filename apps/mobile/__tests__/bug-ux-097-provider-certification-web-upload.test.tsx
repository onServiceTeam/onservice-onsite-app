import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockAddCertification = jest.fn().mockResolvedValue({ id: 'cert-1' });
const mockUploadImages = jest.fn().mockResolvedValue([{
  id: 'upload-1',
  url: 'https://files.example/onboarding/user-1/certificate.jpg',
  filename: 'certificate.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 100,
}]);
const mockLaunchImageLibrary = jest.fn().mockResolvedValue({
  canceled: false,
  assets: [{ uri: 'blob:https://app.onservice.ph/certificate-photo' }],
});

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibrary(...args),
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyCertifications: jest.fn().mockResolvedValue([]),
  addCertification: (...args: unknown[]) => mockAddCertification(...args),
  updateCertification: jest.fn(),
  removeCertification: jest.fn(),
}));
jest.mock('@/services/upload.service', () => ({
  uploadImages: (...args: unknown[]) => mockUploadImages(...args),
}));
jest.mock('@/components/provider/NbiStatusBanner', () => () => null);
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1366, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));

import CertificationsScreen from '../app/provider/certifications';

it('Bug UX-097 — browser certification upload sends the selected blob through private onboarding upload before saving its returned URL', async () => {
  const originalPlatform = Platform.OS;
  Platform.OS = 'web';
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(
    <QueryClientProvider client={client}>
      <CertificationsScreen />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(view.container.textContent).toContain('No Certifications Yet'));

  fireEvent.click(view.getAllByText('Add Certification')[0]!);
  fireEvent.change(view.getByLabelText('Certification name'), { target: { value: 'Plumbing NC II' } });
  fireEvent.click(view.getByText('Add certificate photo'));
  await waitFor(() => expect(mockLaunchImageLibrary).toHaveBeenCalled());
  await waitFor(() => expect(view.container.textContent).toContain('Change'));
  fireEvent.click(view.getByText('Save certification'));

  await waitFor(() => expect(mockUploadImages).toHaveBeenCalledWith(
    ['blob:https://app.onservice.ph/certificate-photo'],
    'onboarding',
  ));
  await waitFor(() => expect(mockAddCertification).toHaveBeenCalledWith(expect.objectContaining({
    name: 'Plumbing NC II',
    certificateUrl: 'https://files.example/onboarding/user-1/certificate.jpg',
  })));
  Platform.OS = originalPlatform;
});
