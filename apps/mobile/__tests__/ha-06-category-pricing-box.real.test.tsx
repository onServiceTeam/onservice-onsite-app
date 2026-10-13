// Human audit 2026-10-13, item HA-06 (Ken's notes): after tapping a service,
// "the first impression ... is they are trying to make sure they will not be
// scammed". The category screen now explains, before the list, how the price
// is set and agreed. The box only states facts that are true today: no
// guarantee, insurance or escrow wording (legal hold E10/F#10).
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'aircon' }),
}));
jest.mock('@/services/catalog.service', () => ({
  getSubcategories: jest.fn().mockResolvedValue({
    categoryName: 'Aircon Services',
    subcategories: [{
      id: 'svc-fixed', categoryId: 'cat-aircon', name: 'Aircon cleaning', slug: 'aircon-cleaning',
      description: '', pricingType: 'fixed', basePrice: 95000, minPrice: null, maxPrice: null,
      estimatedDurationMinutes: 90, unitLabel: null, unitPrice: null, hourlyRate: null, displayOrder: 1,
    }],
  }),
}));

import SubcategoryListScreen from '../app/customer/category/[id]';

it('HA-06: the category screen shows the "How pricing works" box with the agreed-in-app explanation', async () => {
  (api.get as jest.Mock).mockReset().mockResolvedValue({ data: { success: true, data: { requestFirstBooking: true } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><SubcategoryListScreen /></QueryClientProvider>);

  const box = await screen.findByTestId('how-pricing-works');
  expect(box.textContent).toContain('How pricing works');
  expect(box.textContent).toContain(
    'No set prices. Every job is different, so a pro prices your exact job after seeing your details. You accept the price in the app before any work starts. Pay only through onService.',
  );
  expect(box.textContent).not.toMatch(/guarantee|insur|escrow|protected/i);
  expect(box.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('ShieldCheck');
  // Header (category name) and the intro line with the category icon chip.
  expect(screen.getByText('Aircon Services').getAttribute('role')).toBe('header');
  const intro = screen.getByText('Choose the service you need');
  expect(intro.parentElement?.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('AirVent');
});
