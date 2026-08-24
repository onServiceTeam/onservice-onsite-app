import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUploadBookingPhoto = jest.fn();
const mockRemoveImage = jest.fn();
const mockReset = jest.fn();
const mockShowToast = jest.fn();
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ providerBeforePhotos: [], providerAfterPhotos: [] }),
}));
jest.mock('@/services/booking-photo.service', () => ({
  listBookingPhotos: jest.fn().mockResolvedValue([]),
  uploadBookingPhoto: (...args: unknown[]) => mockUploadBookingPhoto(...args),
}));
jest.mock('@/hooks/useImagePicker', () => ({
  useImagePicker: () => ({
    localUris: ['blob:https://app.onservice.ph/saved', 'blob:https://app.onservice.ph/failed'],
    uploadedFiles: [], isUploading: false,
    pickFromGallery: jest.fn(), pickFromCamera: jest.fn(), removeImage: mockRemoveImage,
    uploadAll: jest.fn(), showPickerOptions: jest.fn(), reset: mockReset,
  }),
}));
jest.mock('@/lib/toast', () => ({ showToast: (...args: unknown[]) => mockShowToast(...args) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));

import ProviderPhotosScreen from '../app/provider/job/[id]/photos';

it('BUG-UX-192 — a partial evidence upload removes saved selections but retains failed photos for retry', async () => {
  mockUploadBookingPhoto
    .mockResolvedValueOnce({ id: 'photo-1' })
    .mockRejectedValueOnce(new Error('upload failed'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <ProviderPhotosScreen />
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByText('Upload 2 Before Photos'));

  await waitFor(() => expect(mockRemoveImage).toHaveBeenCalledWith(0));
  expect(mockRemoveImage).not.toHaveBeenCalledWith(1);
  expect(mockReset).not.toHaveBeenCalled();
  expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/failed and remain selected/i), 'error');
});
