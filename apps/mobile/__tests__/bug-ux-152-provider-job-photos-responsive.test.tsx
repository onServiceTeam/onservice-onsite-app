import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ providerBeforePhotos: [], providerAfterPhotos: [] }),
}));
jest.mock('@/services/booking-photo.service', () => ({
  listBookingPhotos: jest.fn().mockResolvedValue([]),
  uploadBookingPhoto: jest.fn(),
}));
jest.mock('@/hooks/useImagePicker', () => ({
  useImagePicker: () => ({
    localUris: [], uploadedFiles: [], isUploading: false,
    pickFromGallery: jest.fn(), pickFromCamera: jest.fn(), removeImage: jest.fn(),
    uploadAll: jest.fn(), showPickerOptions: jest.fn(), reset: jest.fn(),
  }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));

import ProviderPhotosScreen from '../app/provider/job/[id]/photos';

it('BUG-UX-152 — provider job photos render a tablet and desktop evidence workspace', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <ProviderPhotosScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText('Tablet and desktop provider job photos workspace')).toBeTruthy();
  expect(screen.getByText('EVIDENCE STAGE')).toBeTruthy();
});
