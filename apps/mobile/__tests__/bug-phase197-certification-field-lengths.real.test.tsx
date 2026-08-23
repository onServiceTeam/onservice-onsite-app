import React from 'react';
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
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));

import CertificationsScreen from '../app/provider/certifications';

it('Bug PHASE197-02 — rendered certification fields enforce the same text limits as the API', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(
    <QueryClientProvider client={client}>
      <CertificationsScreen />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(view.container.textContent).toContain('No Certifications Yet'));
  fireEvent.click(view.getAllByText('Add Certification')[0]!);

  expect(view.getByLabelText('Certification name').getAttribute('maxlength')).toBe('200');
  expect(view.getByLabelText('Certification issuing body').getAttribute('maxlength')).toBe('200');
  expect(view.getByLabelText('Certification number').getAttribute('maxlength')).toBe('100');
});
