// HA-M2-506 (D38 Milestone 2, package P5a review fix): the files sent with a
// request are never removed when the form closes. Leaving the form removes
// unsent uploads (HA-M2-505), and sending a request closes the form
// (router.replace), so the form marks the ids it sends as the request's own
// first. Removing them would cost a wasted request per file at best (the
// server refuses to remove an attached file) and, if the customer left
// mid-send, could pull a file out from under the request.
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import api from '@/services/api';

const mockDraft = {
  categoryId: 'category-1', categoryName: 'Plumbing', categorySlug: 'plumbing',
  subcategoryId: 'subcategory-1', subcategoryName: 'Leak repair',
  serviceDescription: '', pricingType: 'fixed',
  address: '22 Mango Avenue', barangay: 'Kamputhaw', city: 'Cebu City', province: 'Cebu',
  latitude: 10.3157, longitude: 123.8854,
};
const mockCreateJobRequest = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/stores/booking.store', () => ({
  useBookingStore: (selector: (state: { draft: typeof mockDraft }) => unknown) => selector({ draft: mockDraft }),
}));
jest.mock('@/services/booking.service', () => ({
  createJobRequest: (...args: unknown[]) => mockCreateJobRequest(...args),
  getSubcategoryIntakeFields: jest.fn().mockResolvedValue([]),
}));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
}));

import JobRequestScreen from '../app/customer/booking/job-request';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fileSystem = require('expo-file-system') as {
  __setMockFile: (uri: string, bytes: Uint8Array) => void;
  __clearMockFiles: () => void;
};

const PHOTO = 'file:///tmp/cache/ImagePicker/water-heater.jpg';

beforeEach(() => {
  fileSystem.__clearMockFiles();
  fileSystem.__setMockFile(PHOTO, new Uint8Array(1500));
  jest.mocked(api.post).mockReset();
  jest.mocked(api.put).mockReset();
  jest.mocked(api.delete).mockReset();
  jest.mocked(api.delete).mockResolvedValue({ data: { success: true } } as never);
  mockCreateJobRequest.mockReset();
});

it('HA-M2-506: closing the form after the request is sent keeps the files the request carries', async () => {
  jest.mocked(api.get).mockImplementation((async () => ({ data: { success: true, data: null } })) as never);
  jest.mocked(api.post).mockImplementation((async (url: string) => {
    if (url === '/api/v1/job-media') {
      return { data: { success: true, data: {
        id: 'media-heater', status: 'uploading', kind: 'photo', purpose: 'job_request', chunkBytes: 2097152,
        totalChunks: 1, bytesReceived: 0, nextIndex: 0, rejectionCode: null, limits: { bytes: 10485760, durationMs: null },
      } } };
    }
    return { data: { success: true, data: { id: 'media-heater', status: 'stored', kind: 'photo' } } };
  }) as never);
  jest.mocked(api.put).mockResolvedValue({ data: { success: true, data: { bytesReceived: 1500, nextIndex: 1, complete: true } } } as never);
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [{ uri: PHOTO, width: 1200, height: 900, type: 'image', mimeType: 'image/jpeg', fileSize: 1500 }],
  } as never);
  mockCreateJobRequest.mockResolvedValue({ id: 'booking-51' });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><JobRequestScreen /></QueryClientProvider>);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add a job photo' })); });
  await waitFor(() => expect((screen.getByRole('button', { name: 'Send request' }) as HTMLButtonElement).disabled).toBe(false));

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send request' })); });
  await waitFor(() => expect(mockCreateJobRequest).toHaveBeenCalledTimes(1));
  expect((mockCreateJobRequest.mock.calls[0]![0] as { mediaIds?: string[] }).mediaIds).toEqual(['media-heater']);

  // Sending closes the form (router.replace).
  view.unmount();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

  expect(jest.mocked(api.delete)).not.toHaveBeenCalled();
});
