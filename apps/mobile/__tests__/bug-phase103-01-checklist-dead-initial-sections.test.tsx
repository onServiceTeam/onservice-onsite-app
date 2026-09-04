import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGet = jest.fn();

jest.mock('@/services/api', () => ({
  __esModule: true,
  ApiError: class ApiError extends Error {},
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    patch: jest.fn(),
    post: jest.fn(),
  },
}));
jest.mock('@/services/booking-photo.service', () => ({ uploadBookingPhoto: jest.fn() }));
jest.mock('@/utils/image-capture', () => ({ captureImageAsync: jest.fn() }));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 1280,
    breakpoint: 'desktop',
    isPhone: false,
    isTablet: false,
    isDesktop: true,
  }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));

import JobChecklistScreen from '../app/provider/job/[id]/checklist';

it('BUG-PHASE103-01 - provider checklist renders arbitrary server sections instead of a cleaning-only fallback', async () => {
  mockGet.mockResolvedValue({
    data: {
      data: {
        sections: [{
          id: 'section-plumbing',
          title: 'Water supply',
          items: [{
            id: 'item-shutoff',
            title: 'Inspect the shutoff valve',
            description: 'Confirm the valve opens and closes safely.',
            isCompleted: false,
            completedAt: null,
            photoId: null,
            photoUrl: null,
            photoRequired: false,
          }],
        }],
      },
    },
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><JobChecklistScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Tablet and desktop provider checklist workspace')).toBeTruthy();
  expect(screen.getByText('Water supply')).toBeTruthy();
  expect(screen.getByText('Inspect the shutoff valve')).toBeTruthy();
  expect(screen.queryByText('Vacuum floor')).toBeNull();
  expect(mockGet).toHaveBeenCalledWith('/api/v1/jobs/booking-1/checklist');
});
