// HA-M2-204 (D38 Milestone 2, package P5a): the "Book a service" form keeps
// "Send request" blocked while a photo, video or voice note is still
// uploading, and sends only the files the server stored. A file that failed
// is never sent; "Send without them" drops it and sends the rest.
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import api, { ApiError } from '@/services/api';

const mockDraft = {
  categoryId: 'category-1', categoryName: 'Plumbing', categorySlug: 'plumbing',
  subcategoryId: 'subcategory-1', subcategoryName: 'Leak repair',
  serviceDescription: '', pricingType: 'fixed',
  address: '22 Mango Avenue', barangay: 'Kamputhaw', city: 'Cebu City', province: 'Cebu',
  latitude: 10.3157, longitude: 123.8854,
};
const mockCreateJobRequest = jest.fn().mockResolvedValue({ id: 'booking-44' });
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: (...args: unknown[]) => mockReplace(...args) }) }));
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

const PHOTO_A = 'file:///tmp/cache/ImagePicker/sink-a.jpg';
const PHOTO_B = 'file:///tmp/cache/ImagePicker/sink-b.jpg';

beforeEach(() => {
  fileSystem.__clearMockFiles();
  fileSystem.__setMockFile(PHOTO_A, new Uint8Array(1000));
  fileSystem.__setMockFile(PHOTO_B, new Uint8Array(1200));
  mockCreateJobRequest.mockClear();
});

it('HA-M2-204: Send waits while a file uploads, and the request carries only the stored media ids', async () => {
  jest.mocked(api.get).mockImplementation((async () => ({ data: { success: true, data: null } })) as never);
  let started = 0;
  jest.mocked(api.post).mockImplementation((async (url: string) => {
    if (url === '/api/v1/job-media') {
      started += 1;
      const id = started === 1 ? 'media-a' : 'media-b';
      return { data: { success: true, data: {
        id, status: 'uploading', kind: 'photo', purpose: 'job_request', chunkBytes: 2097152,
        totalChunks: 1, bytesReceived: 0, nextIndex: 0, rejectionCode: null, limits: { bytes: 10485760, durationMs: null },
      } } };
    }
    if (url === '/api/v1/job-media/media-a/complete') {
      return { data: { success: true, data: { id: 'media-a', status: 'stored', kind: 'photo' } } };
    }
    throw new Error(`unexpected POST ${url}`);
  }) as never);
  let failPhotoB: (error: unknown) => void = () => undefined;
  jest.mocked(api.put).mockImplementation(((url: string) => {
    if (url.includes('/media-a/')) {
      return Promise.resolve({ data: { success: true, data: { bytesReceived: 1000, nextIndex: 1, complete: true } } });
    }
    return new Promise((_resolve, reject) => { failPhotoB = reject; });
  }) as never);
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [
      { uri: PHOTO_A, width: 1200, height: 900, type: 'image', mimeType: 'image/jpeg', fileSize: 1000 },
      { uri: PHOTO_B, width: 1200, height: 900, type: 'image', mimeType: 'image/jpeg', fileSize: 1200 },
    ],
  } as never);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><JobRequestScreen /></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText('Describe the job'), { target: { value: 'Kitchen sink leaks under the cabinet.' } });
  // The form is ready to send (its questions loaded) before any file is added.
  await waitFor(() => expect((screen.getByRole('button', { name: 'Send request' }) as HTMLButtonElement).disabled).toBe(false));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add a job photo' })); });

  // Photo A is stored; photo B is still uploading, so Send is blocked.
  expect(await screen.findByText('Uploading 1 file. You can send your request when the upload finishes.')).toBeTruthy();
  const send = screen.getByRole('button', { name: 'Send request' }) as HTMLButtonElement;
  expect(send.disabled).toBe(true);
  fireEvent.click(send);
  expect(mockCreateJobRequest).not.toHaveBeenCalled();

  // Photo B fails. Send explains it and still sends nothing.
  await act(async () => {
    failPhotoB(new ApiError(400, { success: false, error: { message: 'This chunk is not the expected size.', statusCode: 400, code: 'chunk_length_mismatch' } }, 'HTTP 400'));
  });
  await waitFor(() => expect((screen.getByRole('button', { name: 'Send request' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
  expect(await screen.findByText('1 file did not upload. Retry, remove it, or send your request without it.')).toBeTruthy();
  expect(mockCreateJobRequest).not.toHaveBeenCalled();

  // "Send without them": only the stored photo goes with the request.
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send request without the files that did not upload' }));
  });
  await waitFor(() => expect(mockCreateJobRequest).toHaveBeenCalledTimes(1));
  const payload = mockCreateJobRequest.mock.calls[0]![0] as Record<string, unknown>;
  expect(payload.mediaIds).toEqual(['media-a']);
  expect(payload.jobPhotos).toBeUndefined();
  expect(typeof payload.clientRequestId).toBe('string');
});
