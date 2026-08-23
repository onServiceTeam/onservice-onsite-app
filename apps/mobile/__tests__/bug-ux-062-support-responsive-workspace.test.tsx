import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({
    bookingId: '11111111-1111-4111-8111-111111111111',
    type: 'booking_issue',
    subject: 'Help with booking OS-1001',
  }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 1024,
    breakpoint: 'desktop',
    isPhone: false,
    isTablet: false,
    isDesktop: true,
  }),
}));

import NewSupportRequestScreen from '../app/support/new';

it('Bug UX-062 — support forms use the bounded desktop workspace and preserve booking context', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><NewSupportRequestScreen /></QueryClientProvider>);

  expect(screen.getByLabelText('Desktop support request workspace')).toBeTruthy();
  expect(screen.getByText('Linked to booking 11111111')).toBeTruthy();
  expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('Help with booking OS-1001');
});
