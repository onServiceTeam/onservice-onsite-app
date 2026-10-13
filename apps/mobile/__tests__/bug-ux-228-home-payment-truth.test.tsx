import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
  byBreakpoint: (_breakpoint: string, values: { desktop: number }) => values.desktop,
}));
jest.mock('@/services/catalog.service', () => ({
  getCategories: jest.fn().mockResolvedValue([]), getActivePromotions: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/booking.service', () => ({
  getActiveBookings: jest.fn().mockResolvedValue([]), getRecentBookings: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/address.service', () => ({ getAddresses: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: [], meta: { unread: 0 } } }) },
}));

import HomeScreen from '../app/(tabs)/home';

// Human audit 2026-10-13 (HA-DISC) removed the old "Track payment" tile (and
// its escrow-status line) together with the TrustStrip. The home screen now
// only says that the customer accepts, books and pays in the app; it makes no
// escrow claim at all (legal hold E10/F#10). This test asserts that truth.
it('Bug UX-228 — customer home says payment happens in the app and makes no escrow-protection claim', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(<QueryClientProvider client={client}><HomeScreen /></QueryClientProvider>);

  expect(await screen.findByText('Accept, book and pay in the app')).toBeTruthy();
  expect(screen.queryByText(/Payment held in escrow until you confirm/i)).toBeNull();
  expect(container.textContent).not.toMatch(/escrow/i);
});
