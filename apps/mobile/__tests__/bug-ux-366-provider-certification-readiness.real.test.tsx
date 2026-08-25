import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyCertifications: jest.fn().mockResolvedValue([
    {
      id: 'cert-verified',
      name: 'Electrical Installation NC II',
      issuingBody: 'TESDA',
      certificateNumber: 'TESDA-100',
      issuedDate: '2025-01-10',
      expiryDate: '2030-01-10',
      isVerified: true,
      hasDocument: true,
    },
    {
      id: 'cert-missing',
      name: 'Aircon Servicing Training',
      issuingBody: 'Training Center',
      certificateNumber: null,
      issuedDate: null,
      expiryDate: null,
      isVerified: false,
      hasDocument: false,
    },
  ]),
  addCertification: jest.fn(),
  updateCertification: jest.fn(),
  removeCertification: jest.fn(),
}));
jest.mock('@/services/upload.service', () => ({ uploadImages: jest.fn() }));
jest.mock('@/components/provider/NbiStatusBanner', () => () => null);
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 1180,
    breakpoint: 'desktop',
    isPhone: false,
    isTablet: false,
    isDesktop: true,
  }),
}));

import CertificationsScreen from '../app/provider/certifications';

it('Bug UX-366 — provider credentials distinguish missing evidence from real review and summarize verified, review, and attention states', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  render(
    <QueryClientProvider client={client}>
      <CertificationsScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText('1 verified certifications, 0 pending review, 1 need attention')).toBeTruthy();
  expect(screen.getByText('Needs Photo')).toBeTruthy();
  expect(screen.queryByText('Pending Review')).toBeNull();
  expect(screen.getByLabelText('Edit Aircon Servicing Training')).toBeTruthy();
});
