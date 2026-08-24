import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1180, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  ApiError: class ApiError extends Error {},
  default: { patch: jest.fn() },
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

import JobCompletionScreen from '../app/customer/booking/complete';

it('BUG-UX-159 — customer completion renders a bounded tablet and desktop decision workspace', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><JobCompletionScreen /></QueryClientProvider>);

  expect(screen.getByLabelText('Tablet and desktop customer job completion workspace')).toBeTruthy();
  expect(screen.getByText('Confirm the completed service')).toBeTruthy();
  expect(screen.getByText('Yes, looks great!')).toBeTruthy();
  expect(screen.getByText("Something's not right")).toBeTruthy();
});
