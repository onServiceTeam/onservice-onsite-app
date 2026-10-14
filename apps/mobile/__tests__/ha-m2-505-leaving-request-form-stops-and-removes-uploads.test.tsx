// HA-M2-505 (D38 Milestone 2, package P5a review fix): leaving the "Book a
// service" form stops the upload that is running and removes the server
// copies of files that were never sent. Before, the running upload kept
// sending chunks in the background (up to 80 MB of mobile data for a video)
// and every unsent file stayed on the server for 24 hours, counting towards
// the account's upload quota, so a customer who started again could be
// refused with job_media_quota.
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

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/stores/booking.store', () => ({
  useBookingStore: (selector: (state: { draft: typeof mockDraft }) => unknown) => selector({ draft: mockDraft }),
}));
jest.mock('@/services/booking.service', () => ({
  createJobRequest: jest.fn(),
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

const MiB = 1024 * 1024;
const PHOTO_A = 'file:///tmp/cache/ImagePicker/ceiling-a.jpg';
const PHOTO_B = 'file:///tmp/cache/ImagePicker/ceiling-b.jpg';

beforeEach(() => {
  fileSystem.__clearMockFiles();
  fileSystem.__setMockFile(PHOTO_A, new Uint8Array(1000));
  fileSystem.__setMockFile(PHOTO_B, new Uint8Array(3 * MiB));
  jest.mocked(api.post).mockReset();
  jest.mocked(api.put).mockReset();
  jest.mocked(api.delete).mockReset();
  jest.mocked(api.delete).mockResolvedValue({ data: { success: true } } as never);
});

it('HA-M2-505: leaving the request form stops the running upload and removes the unsent server copies', async () => {
  jest.mocked(api.get).mockImplementation((async () => ({ data: { success: true, data: null } })) as never);
  let started = 0;
  jest.mocked(api.post).mockImplementation((async (url: string) => {
    if (url === '/api/v1/job-media') {
      started += 1;
      const second = started === 2;
      return { data: { success: true, data: {
        id: second ? 'media-b' : 'media-a', status: 'uploading', kind: 'photo', purpose: 'job_request', chunkBytes: 2 * MiB,
        totalChunks: second ? 2 : 1, bytesReceived: 0, nextIndex: 0, rejectionCode: null, limits: { bytes: 10 * MiB, durationMs: null },
      } } };
    }
    if (url === '/api/v1/job-media/media-a/complete') {
      return { data: { success: true, data: { id: 'media-a', status: 'stored', kind: 'photo' } } };
    }
    throw new Error(`unexpected POST ${url}`);
  }) as never);
  let finishFirstChunkOfB: () => void = () => undefined;
  jest.mocked(api.put).mockImplementation(((url: string) => {
    if (url.includes('/media-a/')) {
      return Promise.resolve({ data: { success: true, data: { bytesReceived: 1000, nextIndex: 1, complete: true } } });
    }
    return new Promise((resolve) => {
      finishFirstChunkOfB = () => resolve({ data: { success: true, data: { bytesReceived: 2 * MiB, nextIndex: 1, complete: false } } });
    });
  }) as never);
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [
      { uri: PHOTO_A, width: 1200, height: 900, type: 'image', mimeType: 'image/jpeg', fileSize: 1000 },
      { uri: PHOTO_B, width: 1200, height: 900, type: 'image', mimeType: 'image/jpeg', fileSize: 3 * MiB },
    ],
  } as never);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><JobRequestScreen /></QueryClientProvider>);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add a job photo' })); });
  // Photo A is stored; photo B is sending its first chunk.
  expect(await screen.findByText('Uploading 1 file. You can send your request when the upload finishes.')).toBeTruthy();
  await waitFor(() => expect(jest.mocked(api.put).mock.calls.some(([url]) => String(url).includes('/media-b/chunks/0'))).toBe(true));

  // The customer leaves the form.
  view.unmount();
  await act(async () => {
    finishFirstChunkOfB();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  // Photo B sent no further chunk and was never completed.
  const putsForB = jest.mocked(api.put).mock.calls.filter(([url]) => String(url).includes('/media-b/'));
  expect(putsForB).toHaveLength(1);
  expect(jest.mocked(api.post).mock.calls.some(([url]) => url === '/api/v1/job-media/media-b/complete')).toBe(false);
  // Neither file was sent with a request, so both server copies are removed.
  const deleted = jest.mocked(api.delete).mock.calls.map(([url]) => url).sort();
  expect(deleted).toEqual(['/api/v1/job-media/media-a', '/api/v1/job-media/media-b']);
});
