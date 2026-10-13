// Human audit 2026-10-13, item HA-01 (Ken's notes): "the first page ... doesnt
// have some type of title on it. Example book a service". The signed-in
// customer home now opens with an onService wordmark and a "Book a service"
// page title instead of an initial-letter avatar and a greeting.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { firstName: 'Ana' } }) }));
jest.mock('@/services/catalog.service', () => ({
  getCategories: jest.fn().mockResolvedValue([{ id: 'category-1', name: 'Aircon Services', slug: 'aircon' }]),
  getActivePromotions: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/booking.service', () => ({
  getActiveBookings: jest.fn().mockResolvedValue([]),
  getRecentBookings: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/address.service', () => ({ getAddresses: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: [], meta: { unread: 0 } } }) },
}));

import HomeScreen from '../app/(tabs)/home';

// The same react-native stub object the screen imports (jest moduleNameMapper).
const ReactNative = require('react-native') as {
  Platform: { OS: string };
  useWindowDimensions: () => { width: number; height: number; scale: number; fontScale: number };
};

function renderHome(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><HomeScreen /></QueryClientProvider>);
}

it('HA-01: home shows the "Book a service" page title under an onService wordmark on a phone', async () => {
  renderHome();

  const title = await screen.findByText('Book a service');
  expect(title.getAttribute('role')).toBe('header');
  expect(screen.getByTestId('home-wordmark').textContent).toBe('onService');
  expect(
    screen.getByText(
      'Tell us what you need. A local pro sends you a price for your exact job, and you accept it in the app before any work starts.',
    ),
  ).toBeTruthy();
  // The greeting is a small line, not the page title, and the initial-letter
  // avatar header is gone.
  expect(screen.getByText('Welcome back, Ana').getAttribute('role')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Open customer profile' })).toBeNull();
});

it('HA-01: wide web hides the phone wordmark because the desktop frame already shows the brand', async () => {
  const originalOS = ReactNative.Platform.OS;
  const sizeSpy = jest
    .spyOn(ReactNative, 'useWindowDimensions')
    .mockReturnValue({ width: 1280, height: 900, scale: 1, fontScale: 1 });
  ReactNative.Platform.OS = 'web';
  try {
    renderHome();

    expect(await screen.findByText('Book a service')).toBeTruthy();
    expect(screen.getByLabelText('Wide customer home workspace')).toBeTruthy();
    expect(screen.queryByTestId('home-wordmark')).toBeNull();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
  } finally {
    ReactNative.Platform.OS = originalOS;
    sizeSpy.mockRestore();
  }
});
