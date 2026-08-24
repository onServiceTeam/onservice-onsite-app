import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGet = jest.fn();
const mockPatch = jest.fn();
const mockCaptureImage = jest.fn();
const mockUploadBookingPhoto = jest.fn();

jest.mock('@/services/api', () => ({
  __esModule: true,
  ApiError: class ApiError extends Error {},
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    post: jest.fn(),
  },
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/image-capture', () => ({
  captureImageAsync: (...args: unknown[]) => mockCaptureImage(...args),
}));
jest.mock('@/services/booking-photo.service', () => ({
  uploadBookingPhoto: (...args: unknown[]) => mockUploadBookingPhoto(...args),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));

import JobChecklistScreen from '../app/provider/job/[id]/checklist';

it('BUG-UX-148 — uploaded checklist proof is attached to its checklist item', async () => {
  mockGet.mockResolvedValue({
    data: { data: { sections: [{ id: 'section-1', title: 'Completion', items: [{
      id: 'item-1', title: 'Photograph the finished work', description: null,
      isCompleted: false, completedAt: null, photoId: null, photoUrl: null,
      photoRequired: true,
    }] }] } },
  });
  mockCaptureImage.mockResolvedValue({
    status: 'done',
    result: { canceled: false, assets: [{ uri: 'blob:https://app.onservice.ph/proof' }] },
  });
  mockUploadBookingPhoto.mockResolvedValue({
    id: 'photo-9', bookingId: 'booking-1', photoType: 'checklist',
    storageKey: 'booking-1/photo-9.jpg', storageUrl: 'https://api.onservice.ph/uploads/photo-9.jpg',
    uploadedAt: '2026-08-24T00:00:00.000Z',
  });
  mockPatch.mockResolvedValue({ data: { data: { id: 'item-1', isCompleted: false, photoId: 'photo-9' } } });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><JobChecklistScreen /></QueryClientProvider>);
  const photoText = await screen.findByText('+ Photo');
  fireEvent.click(photoText.closest('button')!);

  await waitFor(() => expect(mockPatch).toHaveBeenCalledWith(
    '/api/v1/jobs/booking-1/checklist/items/item-1',
    { completed: false, photoId: 'photo-9' },
  ));
  await waitFor(() => expect(screen.getByText('Replace photo')).toBeTruthy());
});
