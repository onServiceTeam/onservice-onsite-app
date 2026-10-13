// Human audit 2026-10-13, item HA-02: the home search asks the customer to
// describe the problem in their own words (as Thumbtack and Airtasker do)
// instead of "Search services or providers", and still opens the existing
// search screen. Because the catalog search matches whole phrases, a problem
// sentence with no exact match must still lead somewhere.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { firstName: 'Ana' } }) }));
jest.mock('@/services/booking.service', () => ({
  getActiveBookings: jest.fn().mockResolvedValue([]),
  getRecentBookings: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/address.service', () => ({ getAddresses: jest.fn().mockResolvedValue([]) }));

import HomeScreen from '../app/(tabs)/home';
import SearchScreen from '../app/customer/search';

const CATEGORIES = [
  { id: 'category-aircon', name: 'Aircon Services', slug: 'aircon', description: '', iconUrl: null, displayOrder: 1 },
  { id: 'category-plumbing', name: 'Plumbing', slug: 'plumbing', description: '', iconUrl: null, displayOrder: 2 },
];

function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

beforeEach(() => {
  mockPush.mockClear();
  (api.get as jest.Mock).mockReset().mockImplementation(async (url: string) => {
    if (url === '/api/v1/catalog') return { data: { success: true, data: CATEGORIES } };
    if (url === '/api/v1/catalog/search') return { data: { success: true, data: { services: [], providers: [] } } };
    if (url === '/api/v1/promotions/active') return { data: { success: true, data: [] } };
    return { data: { success: true, data: [], meta: { unread: 0 } } };
  });
});

it('HA-02: the home search prompt asks the customer to describe the problem and opens search', async () => {
  render(<QueryClientProvider client={newClient()}><HomeScreen /></QueryClientProvider>);

  expect(await screen.findByText('Describe the problem, e.g. aircon not cooling')).toBeTruthy();
  expect(screen.queryByText('Search services or providers...')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Describe the problem to find a service' }));
  expect(mockPush).toHaveBeenCalledWith('/customer/search');
});

it('HA-02: a problem sentence with no exact search match still points to the matching service category', async () => {
  const { container } = render(<QueryClientProvider client={newClient()}><SearchScreen /></QueryClientProvider>);
  // Wait for the category list so the suggestions have data to match.
  expect(await screen.findByRole('button', { name: 'Browse Aircon Services' })).toBeTruthy();

  fireEvent.change(container.querySelector('input')!, { target: { value: 'aircon not cooling' } });

  expect(await screen.findByText('No results for "aircon not cooling"')).toBeTruthy();
  const related = screen.getByLabelText('Services that may fit your problem');
  expect(related.textContent).toContain('Aircon Services');
  expect(related.textContent).not.toContain('Plumbing');
  fireEvent.click(screen.getByRole('button', { name: 'Browse Aircon Services' }));
  expect(mockPush).toHaveBeenCalledWith('/customer/category/aircon');
});
