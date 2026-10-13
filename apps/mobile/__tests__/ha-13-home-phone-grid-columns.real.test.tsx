// Human audit 2026-10-13, item HA-13 (task HA-DISC item 3, review fix): with
// 4 columns on a 360-415dp phone each tile leaves only 66-80px for its label.
// Measured in Roboto 600 13px, "Landscaping" is 74.4px and "Maintenance"
// 75.6px, and neither Android nor react-native-web shrinks a single word that
// wraps onto two lines, so the word was split ("Landscapin" / "g"). Phones
// narrower than 416dp now get 3 columns; wider phones keep 4.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let mockWidth = 390;
jest.mock('@/hooks/useResponsive', () => ({
  ...jest.requireActual('@/hooks/useResponsive'),
  useResponsive: () => ({
    width: mockWidth,
    breakpoint: 'phone',
    isPhone: true,
    isTablet: false,
    isDesktop: false,
  }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { firstName: 'Ana' } }) }));
jest.mock('@/services/catalog.service', () => ({
  getCategories: jest.fn().mockResolvedValue([
    { id: 'cat-cleaning', name: 'Cleaning', slug: 'cleaning' },
    { id: 'cat-landscaping', name: 'Landscaping', slug: 'landscaping' },
    { id: 'cat-maintenance', name: 'General Maintenance', slug: 'general-maintenance' },
  ]),
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

// The column count the screen hands to the category FlatList (the jest
// react-native stub renders FlatList props as DOM attributes).
async function gridColumnsAt(width: number): Promise<string | null | undefined> {
  mockWidth = width;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container, unmount } = render(<QueryClientProvider client={client}><HomeScreen /></QueryClientProvider>);
  await screen.findByTestId('category-tile-landscaping');
  const columns = container.querySelector('flatlist')?.getAttribute('numcolumns');
  unmount();
  return columns;
}

it('HA-13: phones narrower than 416dp get a 3-column service grid so one-word names are not split; wider phones get 4', async () => {
  expect(await gridColumnsAt(320)).toBe('3');
  expect(await gridColumnsAt(360)).toBe('3');
  expect(await gridColumnsAt(393)).toBe('3');
  expect(await gridColumnsAt(412)).toBe('3');
  expect(await gridColumnsAt(416)).toBe('4');
  expect(await gridColumnsAt(430)).toBe('4');
});
