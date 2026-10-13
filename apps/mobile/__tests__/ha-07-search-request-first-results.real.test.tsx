// Human audit 2026-10-13, item HA-07 (D38): search follows the same rule as
// the category screen. With request-first booking on (the default), service
// results show no "From ₱X" price and every one opens the describe-your-job
// request.
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

import SearchScreen from '../app/customer/search';
import { useBookingStore } from '../src/stores/booking.store';

const SERVICES = [
  {
    id: 'svc-fixed', categoryId: 'cat-aircon', categoryName: 'Aircon Services', categorySlug: 'aircon',
    name: 'Aircon cleaning', slug: 'aircon-cleaning', description: '', pricingType: 'fixed',
    basePrice: 95000, minPrice: null, maxPrice: null, estimatedDurationMinutes: 90,
    unitLabel: null, unitPrice: null, hourlyRate: null, displayOrder: 1,
  },
  {
    id: 'svc-hourly', categoryId: 'cat-aircon', categoryName: 'Aircon Services', categorySlug: 'aircon',
    name: 'Aircon troubleshooting', slug: 'aircon-troubleshooting',
    description: 'Diagnosis of a unit that does not cool.', pricingType: 'hourly', basePrice: null,
    minPrice: null, maxPrice: null, estimatedDurationMinutes: 60, unitLabel: null, unitPrice: null,
    hourlyRate: 70000, displayOrder: 2,
  },
];

beforeEach(() => {
  mockPush.mockClear();
  useBookingStore.getState().reset();
  (api.get as jest.Mock).mockReset().mockImplementation(async (url: string) => {
    if (url === '/api/v1/config') return { data: { success: true, data: { requestFirstBooking: true } } };
    if (url === '/api/v1/catalog/search') return { data: { success: true, data: { services: SERVICES, providers: [] } } };
    return { data: { success: true, data: [] } };
  });
});

async function searchFor(text: string): Promise<HTMLElement> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><SearchScreen /></QueryClientProvider>);
  fireEvent.change(container.querySelector('input')!, { target: { value: text } });
  expect(await screen.findByRole('button', { name: 'Open Aircon cleaning service' })).toBeTruthy();
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/v1/config'));
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  return container;
}

it('HA-07: search results show no peso price when request-first booking is on', async () => {
  const container = await searchFor('aircon');

  expect(container.textContent).not.toMatch(/₱/);
  expect(screen.queryByText('From')).toBeNull();
  expect(screen.queryByText('Per hour')).toBeNull();
  expect(screen.queryByText('SCOPE DETAILS PENDING')).toBeNull();
  expect(screen.getByText('Diagnosis of a unit that does not cool.')).toBeTruthy();
});

it('HA-07: tapping a search result opens the describe-your-job request when request-first booking is on', async () => {
  await searchFor('aircon');

  fireEvent.click(screen.getByRole('button', { name: 'Open Aircon troubleshooting service' }));

  expect(mockPush).toHaveBeenCalledWith('/customer/booking/job-request');
  expect(useBookingStore.getState().draft).toMatchObject({
    categoryName: 'Aircon Services',
    subcategoryName: 'Aircon troubleshooting',
    pricingType: 'hourly',
    basePrice: 0,
    isHourly: false,
  });
});
