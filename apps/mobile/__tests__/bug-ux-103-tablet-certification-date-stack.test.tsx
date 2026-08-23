import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyCertifications: jest.fn().mockResolvedValue([]),
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

it('Bug UX-103 — the 768px certification form stacks date controls so complete browser dates remain readable', async () => {
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

  expect(view.getByLabelText('Stacked certification date fields')).not.toBeNull();
  Platform.OS = originalPlatform;
});
