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
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));

import CertificationsScreen from '../app/provider/certifications';

it('Bug UX-098 — tablet and desktop certification management exposes a bounded split workspace with native browser date pickers', async () => {
  const originalPlatform = Platform.OS;
  Platform.OS = 'web';
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(
    <QueryClientProvider client={client}>
      <CertificationsScreen />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(view.container.textContent).toContain('No Certifications Yet'));
  expect(view.container.querySelector('[aria-label="Tablet and desktop certification management workspace"]')).not.toBeNull();

  fireEvent.click(view.getAllByText('Add Certification')[0]!);
  const issued = view.getByLabelText('Issued date');
  const expiry = view.getByLabelText('Expiry date');
  expect(issued.getAttribute('type')).toBe('date');
  expect(expiry.getAttribute('type')).toBe('date');
  expect(view.container.textContent).toContain('Your certifications (0)');
  Platform.OS = originalPlatform;
});
