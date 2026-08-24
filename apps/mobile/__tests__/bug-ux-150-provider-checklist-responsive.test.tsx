import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('@/services/api', () => ({
  __esModule: true,
  ApiError: class ApiError extends Error {},
  default: {
    get: jest.fn().mockResolvedValue({ data: { data: { sections: [] } } }),
    patch: jest.fn(),
    post: jest.fn(),
  },
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/services/booking-photo.service', () => ({ uploadBookingPhoto: jest.fn() }));
jest.mock('@/utils/image-capture', () => ({ captureImageAsync: jest.fn() }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));

import JobChecklistScreen from '../app/provider/job/[id]/checklist';

it('BUG-UX-150 — checklist renders an explicit tablet and desktop workspace', async () => {
  render(<JobChecklistScreen />);

  expect(await screen.findByLabelText('Tablet and desktop provider checklist workspace')).toBeTruthy();
  expect(screen.getByText('No checklist tasks for this service')).toBeTruthy();
});
