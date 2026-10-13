// Human audit 2026-10-13, item HA-08 (task HA-DISC item 4): 4 of the 10 live
// categories had no active services and opened a "No services yet" dead end.
// The home grid now reads service counts from the public GET
// /api/v1/catalog/full and leaves out any category it knows is empty. A
// category the counts do not mention stays, so a failed count request never
// hides real services. (Moved here from the HA-03 file so each ID covers one
// behaviour in one file.)
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { firstName: 'Ana' } }) }));
jest.mock('@/services/catalog.service', () => ({
  getCategories: jest.fn().mockResolvedValue([
    { id: 'cat-cleaning', name: 'Cleaning', slug: 'cleaning' },
    { id: 'cat-aircon', name: 'Aircon Services', slug: 'aircon' },
    { id: 'cat-electrical', name: 'Electrical', slug: 'electrical' },
    { id: 'cat-pest', name: 'Pest Control', slug: 'pest-control' },
    { id: 'cat-roofing', name: 'Roofing', slug: 'roofing' },
    { id: 'cat-landscaping', name: 'Landscaping', slug: 'landscaping' },
  ]),
  getActivePromotions: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/booking.service', () => ({
  getActiveBookings: jest.fn().mockResolvedValue([]),
  getRecentBookings: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/address.service', () => ({ getAddresses: jest.fn().mockResolvedValue([]) }));

import HomeScreen from '../app/(tabs)/home';

it('HA-08: categories known to have no active services are left out of the home grid', async () => {
  (api.get as jest.Mock).mockReset().mockImplementation(async (url: string) => {
    if (url === '/api/v1/catalog/full') {
      return {
        data: {
          success: true,
          data: [
            { id: 'cat-cleaning', subcategories: [{ id: 'svc-1' }] },
            { id: 'cat-aircon', subcategories: [{ id: 'svc-2' }, { id: 'svc-3' }] },
            // Electrical is not listed: unknown count, so it must stay visible.
            { id: 'cat-pest', subcategories: [] },
            { id: 'cat-roofing', subcategories: [] },
            { id: 'cat-landscaping', subcategories: [] },
          ],
        },
      };
    }
    return { data: { success: true, data: [], meta: { unread: 0 } } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><HomeScreen /></QueryClientProvider>);
  await screen.findByText('Choose a service');

  // The counts request can resolve after the category list, so wait for the
  // grid to settle on the categories that are not known to be empty.
  await waitFor(() => {
    const slugs = screen.queryAllByTestId(/^category-tile-/).map((tile) => tile.getAttribute('data-testid'));
    expect(slugs).toEqual(['category-tile-cleaning', 'category-tile-aircon', 'category-tile-electrical']);
  });
});
