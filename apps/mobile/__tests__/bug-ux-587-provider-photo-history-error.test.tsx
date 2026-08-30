import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { listBookingPhotos } from '@/services/booking-photo.service';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ providerBeforePhotos: [], providerAfterPhotos: [] }),
}));
jest.mock('@/services/booking-photo.service', () => ({
  listBookingPhotos: jest.fn().mockRejectedValue(new Error('history unavailable')),
  uploadBookingPhoto: jest.fn(),
}));
jest.mock('@/hooks/useImagePicker', () => ({
  useImagePicker: () => ({
    localUris: [], uploadedFiles: [], isUploading: false,
    pickFromGallery: jest.fn(), pickFromCamera: jest.fn(), removeImage: jest.fn(),
    uploadAll: jest.fn(), showPickerOptions: jest.fn(), reset: jest.fn(),
  }),
}));

import ProviderPhotosScreen from '../app/provider/job/[id]/photos';

it('Bug UX-587 — provider photo uploads pause when canonical evidence history cannot be verified', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderPhotosScreen /></QueryClientProvider>);

  expect(await screen.findByText('Photo history unavailable')).toBeTruthy();
  expect(screen.queryByText('Add Photos')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(listBookingPhotos).toHaveBeenCalledTimes(2));
});
