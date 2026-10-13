// HA-REQ-10, lead list (customer human audit 2026-10-13, D38): each lead card
// in the provider's Job Requests inbox shows the customer's photos as
// thumbnails instead of only "N photos", and always states the budget,
// including "Customer is not sure of the price" when none was given.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
  byBreakpoint: (_breakpoint: string, values: { phone: number }) => values.phone,
}));
jest.mock('@/services/socket.service', () => ({ getSocket: () => null }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({
      data: {
        success: true,
        total: 2,
        requests: [
          {
            id: 'request-1', categoryName: 'Aircon Services', description: 'Aircon drips water',
            urgency: 'same_day', budgetMin: 150000, budgetMax: 250000,
            jobPhotos: [
              'https://app.onservice.ph/uploads/job-request/1.jpg',
              'https://app.onservice.ph/uploads/job-request/2.jpg',
              'https://app.onservice.ph/uploads/job-request/3.jpg',
              'https://app.onservice.ph/uploads/job-request/4.jpg',
              'https://app.onservice.ph/uploads/job-request/5.jpg',
            ],
            jobVideoUrl: null, barangay: 'Lahug', city: 'Cebu City', distanceKm: 2.1,
            createdAt: '2026-10-13T01:00:00.000Z',
          },
          {
            id: 'request-2', categoryName: 'Plumbing', description: 'Kitchen sink is clogged',
            urgency: 'flexible', budgetMin: null, budgetMax: null, jobPhotos: [],
            jobVideoUrl: null, barangay: 'Mabolo', city: 'Cebu City', distanceKm: 4,
            createdAt: '2026-10-13T02:00:00.000Z',
          },
        ],
      },
    }),
  },
}));

import ProviderLeadsScreen from '../app/provider/leads';

it('HA-REQ-10: lead cards show photo thumbnails and the budget, or that the customer is not sure of the price', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderLeadsScreen /></QueryClientProvider>);

  expect(await screen.findByText('Aircon drips water')).toBeTruthy();
  expect(screen.getByLabelText('Customer photo 1 of 5')).toBeTruthy();
  expect(screen.getByLabelText('Customer photo 3 of 5')).toBeTruthy();
  expect(screen.queryByLabelText('Customer photo 4 of 5')).toBeNull();
  expect(screen.getByText('+2')).toBeTruthy();
  expect(Array.from(document.querySelectorAll('Image')).map((node) => node.getAttribute('source'))).toEqual([
    'https://app.onservice.ph/uploads/job-request/1.jpg',
    'https://app.onservice.ph/uploads/job-request/2.jpg',
    'https://app.onservice.ph/uploads/job-request/3.jpg',
  ]);
  expect(screen.queryByText(/^\d+ photos?$/)).toBeNull();

  expect(screen.getByText('Budget ₱1,500.00 to ₱2,500.00')).toBeTruthy();
  expect(screen.getByText('Customer is not sure of the price')).toBeTruthy();
});
