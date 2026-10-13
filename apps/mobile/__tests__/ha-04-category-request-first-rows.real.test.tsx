// Human audit 2026-10-13, item HA-04 (Ken's notes, D38): "when clicking the
// service page we should not show a set price". With request-first booking on
// (the default, including a server that does not send the setting), the
// category screen lists services with no peso price, no "SCOPE DETAILS
// PENDING" label, and a tap opens the describe-your-job request directly.
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'aircon' }),
}));
jest.mock('@/services/catalog.service', () => ({
  getSubcategories: jest.fn().mockResolvedValue({
    categoryName: 'Aircon Services',
    subcategories: [
      {
        id: 'svc-fixed', categoryId: 'cat-aircon', name: 'Aircon cleaning', slug: 'aircon-cleaning',
        description: '', pricingType: 'fixed', basePrice: 95000, minPrice: null, maxPrice: null,
        estimatedDurationMinutes: 90, unitLabel: null, unitPrice: null, hourlyRate: null, displayOrder: 1,
      },
      {
        id: 'svc-hourly', categoryId: 'cat-aircon', name: 'Aircon troubleshooting', slug: 'aircon-troubleshooting',
        description: 'Diagnosis of a unit that does not cool.', pricingType: 'hourly', basePrice: null,
        minPrice: null, maxPrice: null, estimatedDurationMinutes: 60, unitLabel: null, unitPrice: null,
        hourlyRate: 70000, displayOrder: 2,
      },
      {
        id: 'svc-quote', categoryId: 'cat-aircon', name: 'Aircon installation', slug: 'aircon-installation',
        description: '', pricingType: 'quote', basePrice: 450000, minPrice: null, maxPrice: null,
        estimatedDurationMinutes: null, unitLabel: null, unitPrice: null, hourlyRate: null, displayOrder: 3,
      },
    ],
  }),
}));

import SubcategoryListScreen from '../app/customer/category/[id]';
import { useBookingStore } from '../src/stores/booking.store';

beforeEach(() => {
  mockPush.mockClear();
  useBookingStore.getState().reset();
  // A config response without the field: the hook must default to request-first.
  (api.get as jest.Mock).mockReset().mockResolvedValue({ data: { success: true, data: { appVersion: '1.0.2' } } });
});

function renderScreen(): HTMLElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><SubcategoryListScreen /></QueryClientProvider>).container;
}

it('HA-04: with request-first on, service rows show no peso price, no "Starting at" and no scope-pending label', async () => {
  const container = renderScreen();

  expect(await screen.findByRole('button', { name: 'Choose Aircon cleaning and describe your job' })).toBeTruthy();
  // Let the config response land and re-render, so the checks below see the
  // resolved setting and not only the while-loading default.
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/v1/config'));
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  expect(screen.getByRole('button', { name: 'Choose Aircon cleaning and describe your job' })).toBeTruthy();
  expect(container.textContent).not.toMatch(/₱/);
  expect(screen.queryByText('Starting at')).toBeNull();
  expect(screen.queryByText('per hour')).toBeNull();
  expect(screen.queryByText('Get Quote')).toBeNull();
  expect(screen.queryByText('SCOPE DETAILS PENDING')).toBeNull();
  // A published description shows as one line; a blank one shows nothing.
  expect(screen.getByText('Diagnosis of a unit that does not cool.')).toBeTruthy();
  expect(screen.queryByText(/Scope details have not been published yet/i)).toBeNull();
});

it('HA-04: tapping a service row opens the describe-your-job request directly, with no price carried', async () => {
  renderScreen();

  fireEvent.click(await screen.findByRole('button', { name: 'Choose Aircon cleaning and describe your job' }));

  expect(mockPush).toHaveBeenCalledWith('/customer/booking/job-request');
  expect(mockPush).not.toHaveBeenCalledWith('/customer/booking/configure');
  // No detail dialog step in between.
  expect(screen.queryByRole('alert')).toBeNull();
  expect(useBookingStore.getState().draft).toMatchObject({
    categoryId: 'cat-aircon',
    categoryName: 'Aircon Services',
    categorySlug: 'aircon',
    subcategoryId: 'svc-fixed',
    subcategoryName: 'Aircon cleaning',
    pricingType: 'fixed',
    basePrice: 0,
    isHourly: false,
  });
});
