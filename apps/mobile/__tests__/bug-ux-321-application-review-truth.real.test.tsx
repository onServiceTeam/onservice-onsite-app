import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockApiGet = jest.fn().mockResolvedValue({ data: { data: { status: 'pending', rejectionReason: null } } });

jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockApiGet(...args) },
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));

import BackgroundCheckStatusScreen from '../app/provider-onboarding/background-check-status';

it('Bug UX-321 — application review shows only server-recorded status and no fabricated rolling ETA or unsupported review SLA', async () => {
  render(<BackgroundCheckStatusScreen />);

  expect(await screen.findByLabelText('Tablet and desktop application review status workspace')).toBeTruthy();
  expect(screen.getByText('Your provider application is under review.')).toBeTruthy();
  expect(screen.queryByText(/Estimated completion/i)).toBeNull();
  expect(screen.queryByText(/48 hours/i)).toBeNull();
  expect(screen.queryByText(/5 business days/i)).toBeNull();
  await waitFor(() => expect(mockApiGet).toHaveBeenCalledTimes(1));
});
