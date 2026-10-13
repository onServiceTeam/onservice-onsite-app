// Human audit 2026-10-13, item HA-14 (task HA-DISC item 4, review fix): hiding
// categories with no services (HA-08) could leave the home grid empty, for
// example on a fresh environment or if ops deactivated every service. The
// customer then saw "Choose a service" over a blank area, while the "How it
// works" box still said "Choose a service above". Home now says plainly that
// nothing is open for booking yet, offers a refresh, and drops the
// "Choose a service above" hint.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { getCategories } from '@/services/catalog.service';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { firstName: 'Ana' } }) }));
jest.mock('@/services/catalog.service', () => ({
  getCategories: jest.fn().mockResolvedValue([
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

it('HA-14: when no category has services, home says nothing is open for booking yet and offers a refresh instead of an empty grid', async () => {
  (api.get as jest.Mock).mockReset().mockImplementation(async (url: string) => {
    if (url === '/api/v1/catalog/full') {
      return {
        data: {
          success: true,
          data: [
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

  expect(await screen.findByText('No services are open for booking yet')).toBeTruthy();
  expect(screen.queryAllByTestId(/^category-tile-/)).toHaveLength(0);
  // The customer has no bookings either, but must not be told to choose a
  // service "above" when there is nothing above to choose.
  expect(screen.queryByText(/Choose a service above/)).toBeNull();

  const callsBefore = (getCategories as jest.Mock).mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh the list of services' }));
  await waitFor(() => expect((getCategories as jest.Mock).mock.calls.length).toBeGreaterThan(callsBefore));
});
