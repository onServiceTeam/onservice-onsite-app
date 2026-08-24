import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockGet = jest.fn();
const mockPatch = jest.fn();

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
jest.mock('@/services/booking-photo.service', () => ({ uploadBookingPhoto: jest.fn() }));
jest.mock('@/utils/image-capture', () => ({ captureImageAsync: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));

import JobChecklistScreen from '../app/provider/job/[id]/checklist';

it('BUG-UX-147 — checklist toggles send the API-required completed field', async () => {
  mockGet.mockResolvedValue({
    data: { data: { sections: [{ id: 'section-1', title: 'Arrival', items: [{
      id: 'item-1', title: 'Inspect the work area', description: null,
      isCompleted: false, completedAt: null, photoId: null, photoUrl: null,
      photoRequired: false,
    }] }] } },
  });
  mockPatch.mockResolvedValue({ data: { data: { id: 'item-1', isCompleted: true } } });

  render(<JobChecklistScreen />);
  const toggle = await screen.findByLabelText('Mark Inspect the work area complete');
  fireEvent.click(toggle);

  await waitFor(() => expect(mockPatch).toHaveBeenCalledWith(
    '/api/v1/jobs/booking-1/checklist/items/item-1',
    { completed: true },
  ));
});
