// Human audit 2026-10-13, item HA-16 (task HA-DISC item 4, review fix): the
// home grid hides categories with no active services (HA-08), but the search
// screen's "Browse services" chips and its "Services that may fit" suggestions
// still offered them. Typing "roof leaking" suggested Roofing, which opened
// the "No services yet" dead end. Search now uses the same service counts as
// home and never offers a category known to be empty.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

import SearchScreen from '../app/customer/search';

const CATEGORIES = [
  { id: 'cat-roofing', name: 'Roofing', slug: 'roofing', description: '', iconUrl: null, displayOrder: 1 },
  { id: 'cat-plumbing', name: 'Plumbing', slug: 'plumbing', description: '', iconUrl: null, displayOrder: 2 },
  { id: 'cat-aircon', name: 'Aircon Services', slug: 'aircon', description: '', iconUrl: null, displayOrder: 3 },
];

it('HA-16: search browse chips and problem suggestions leave out categories known to have no services', async () => {
  (api.get as jest.Mock).mockReset().mockImplementation(async (url: string) => {
    if (url === '/api/v1/catalog') return { data: { success: true, data: CATEGORIES } };
    if (url === '/api/v1/catalog/full') {
      return {
        data: {
          success: true,
          data: [
            { id: 'cat-roofing', subcategories: [] },
            { id: 'cat-plumbing', subcategories: [{ id: 'svc-1' }] },
            { id: 'cat-aircon', subcategories: [{ id: 'svc-2' }] },
          ],
        },
      };
    }
    if (url === '/api/v1/catalog/search') return { data: { success: true, data: { services: [], providers: [] } } };
    return { data: { success: true, data: {} } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><SearchScreen /></QueryClientProvider>);

  // Before typing: the browse chips list only categories that have services.
  expect(await screen.findByRole('button', { name: 'Browse Plumbing' })).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Browse Roofing' })).toBeNull());
  expect(screen.getByRole('button', { name: 'Browse Aircon Services' })).toBeTruthy();

  // A problem sentence with no exact match: "roof" points at Roofing (empty,
  // so left out) and "leaking" at Plumbing (has services, so offered).
  fireEvent.change(container.querySelector('input')!, { target: { value: 'roof leaking' } });
  expect(await screen.findByText('No results for "roof leaking"')).toBeTruthy();
  const related = screen.getByLabelText('Services that may fit your problem');
  expect(related.textContent).toContain('Plumbing');
  expect(related.textContent).not.toContain('Roofing');
});
