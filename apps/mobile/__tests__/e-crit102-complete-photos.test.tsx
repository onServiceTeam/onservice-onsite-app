import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockCaptureImage = jest.fn();
const mockUploadBookingPhoto = jest.fn();
const mockUploadSignature = jest.fn();
const mockPatch = jest.fn();

jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ servicePrice: 100000 }),
}));
jest.mock('@/services/booking-photo.service', () => ({
  listBookingPhotos: jest.fn().mockResolvedValue([]),
  uploadBookingPhoto: (...args: unknown[]) => mockUploadBookingPhoto(...args),
  uploadSignature: (...args: unknown[]) => mockUploadSignature(...args),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  ApiError: class ApiError extends Error {},
  default: {
    get: jest.fn().mockResolvedValue({ data: { data: { tier: 'new', commissionRate: 0.15 } } }),
    patch: (...args: unknown[]) => mockPatch(...args),
  },
}));
jest.mock('@/utils/image-capture', () => ({
  captureImageAsync: (...args: unknown[]) => mockCaptureImage(...args),
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/components/SignaturePad', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: react.forwardRef(function MockSignaturePad(
      props: { onBegin?: () => void; onCapture: (uri: string) => void },
      ref: React.ForwardedRef<{ clear: () => void; readSignature: () => void }>,
    ) {
      react.useImperativeHandle(ref, () => ({
        clear: jest.fn(),
        readSignature: () => props.onCapture('file://customer-signature.png'),
      }));
      return react.createElement(
        'button',
        { type: 'button', onClick: props.onBegin },
        'Capture customer signature',
      );
    }),
  };
});

import JobCompleteScreen from '../app/provider/job/[id]/complete';

it('CRIT-102 — provider completion uploads each captured after-photo before the canonical status transition', async () => {
  mockCaptureImage
    .mockResolvedValueOnce({ status: 'done', result: { canceled: false, assets: [{ uri: 'file://after-1.jpg' }] } })
    .mockResolvedValueOnce({ status: 'done', result: { canceled: false, assets: [{ uri: 'file://after-2.jpg' }] } });
  mockUploadBookingPhoto.mockResolvedValue({ id: 'photo' });
  mockUploadSignature.mockResolvedValue({ id: 'signature' });
  mockPatch.mockResolvedValue({ data: { success: true } });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <JobCompleteScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(container.textContent).toContain('0 on file + 0 new'));
  const photoButtons = Array.from(container.querySelectorAll('button')).filter((button) =>
    (button.textContent ?? '').includes('Tap to capture'),
  );
  fireEvent.click(photoButtons[0]!);
  fireEvent.click(photoButtons[1]!);
  fireEvent.click(Array.from(container.querySelectorAll('button')).find((button) =>
    (button.textContent ?? '').includes('Capture customer signature'),
  )!);

  await waitFor(() => expect(container.textContent).toContain('0 on file + 2 new'));
  fireEvent.click(Array.from(container.querySelectorAll('button')).find((button) =>
    (button.textContent ?? '').includes('Submit Completion'),
  )!);

  await waitFor(() => {
    expect(mockUploadBookingPhoto).toHaveBeenNthCalledWith(1, {
      uri: 'file://after-1.jpg',
      bookingId: 'booking-1',
      photoType: 'after',
    });
    expect(mockUploadBookingPhoto).toHaveBeenNthCalledWith(2, {
      uri: 'file://after-2.jpg',
      bookingId: 'booking-1',
      photoType: 'after',
    });
    expect(mockPatch).toHaveBeenCalledWith('/api/v1/bookings/booking-1/status', {
      status: 'completed_by_provider',
      completionNotes: undefined,
    });
  });
  expect(mockUploadBookingPhoto.mock.invocationCallOrder[1]).toBeLessThan(
    mockPatch.mock.invocationCallOrder[0]!,
  );
});
