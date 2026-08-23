import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUpdateCertification = jest.fn().mockResolvedValue({ id: 'cert-1' });

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyCertifications: jest.fn().mockResolvedValue([{
    id: 'cert-1', name: 'Electrical Installation NC II', issuingBody: 'TESDA',
    certificateNumber: 'TESDA-42', hasDocument: true,
    documentUrl: '/api/v1/providers/me/certifications/cert-1/document',
    issuedDate: '2026-01-01T00:00:00.000Z', expiryDate: '2030-03-15T00:00:00.000Z',
    isVerified: true, verifiedAt: '2026-02-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z',
  }]),
  addCertification: jest.fn(),
  updateCertification: (...args: unknown[]) => mockUpdateCertification(...args),
  removeCertification: jest.fn(),
}));
jest.mock('@/services/upload.service', () => ({ uploadImages: jest.fn() }));
jest.mock('@/components/provider/NbiStatusBanner', () => () => null);
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));

import CertificationsScreen from '../app/provider/certifications';

it('Bug UX-096 — certification cards show friendly dates and edit sends normalized clearable date fields instead of raw timestamps', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(
    <QueryClientProvider client={client}>
      <CertificationsScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(view.container.textContent).toContain('Issued: Jan 1, 2026'));
  expect(view.container.textContent).toContain('Expires: Mar 15, 2030');

  fireEvent.click(view.getByLabelText('Edit Electrical Installation NC II'));
  const issued = view.getByLabelText('Issued date');
  const expiry = view.getByLabelText('Expiry date');
  expect((issued as HTMLInputElement).value).toBe('2026-01-01');
  expect((expiry as HTMLInputElement).value).toBe('2030-03-15');

  fireEvent.change(issued, { target: { value: '2026-02-31' } });
  fireEvent.click(view.getByText('Save certification'));
  expect(alert).toHaveBeenCalledWith('Check certification dates', expect.stringMatching(/real issued date/i));
  expect(mockUpdateCertification).not.toHaveBeenCalled();

  fireEvent.change(issued, { target: { value: '2025-02-28' } });
  fireEvent.change(expiry, { target: { value: '' } });
  fireEvent.change(view.getByLabelText('Certification number'), { target: { value: '' } });
  fireEvent.click(view.getByText('Save certification'));

  await waitFor(() => expect(mockUpdateCertification).toHaveBeenCalledWith('cert-1', {
    name: 'Electrical Installation NC II',
    issuingBody: 'TESDA',
    certificateNumber: null,
    issuedDate: '2025-02-28',
    expiryDate: null,
  }));
  alert.mockRestore();
});
