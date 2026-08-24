import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUploadBookingPhoto = jest.fn();
const mockReset = jest.fn();
const mockRemoveImage = jest.fn();

jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ providerBeforePhotos: [], providerAfterPhotos: [] }),
}));
jest.mock('@/services/booking-photo.service', () => ({
  listBookingPhotos: jest.fn().mockResolvedValue([]),
  uploadBookingPhoto: (...args: unknown[]) => mockUploadBookingPhoto(...args),
}));
jest.mock('@/hooks/useImagePicker', () => ({
  useImagePicker: () => ({
    localUris: ['blob:https://app.onservice.ph/before-photo'],
    uploadedFiles: [], isUploading: false,
    pickFromGallery: jest.fn(), pickFromCamera: jest.fn(), removeImage: mockRemoveImage,
    uploadAll: jest.fn(), showPickerOptions: jest.fn(), reset: mockReset,
  }),
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));

import ProviderPhotosScreen from '../app/provider/job/[id]/photos';

it('BUG-UX-151 — provider job evidence uses the canonical booking-photo upload', async () => {
  mockUploadBookingPhoto.mockResolvedValue({
    id: 'photo-1', bookingId: 'booking-1', photoType: 'before',
    storageKey: 'booking-1/photo-1.jpg', storageUrl: 'https://api.onservice.ph/uploads/photo-1.jpg',
    uploadedAt: '2026-08-24T00:00:00.000Z',
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  render(
    <QueryClientProvider client={client}>
      <ProviderPhotosScreen />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByText('Upload 1 Before Photo'));

  await waitFor(() => expect(mockUploadBookingPhoto).toHaveBeenCalledWith({
    uri: 'blob:https://app.onservice.ph/before-photo',
    bookingId: 'booking-1',
    photoType: 'before',
  }));
  await waitFor(() => expect(mockRemoveImage).toHaveBeenCalledWith(0));
  expect(mockReset).not.toHaveBeenCalled();
});
