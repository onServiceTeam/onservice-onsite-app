import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1', categoryId: 'category-aircon', subcategoryId: 'subcategory-aircon',
    serviceName: 'Aircon repair', description: 'Aircon is not cooling', urgency: null,
    budgetMin: null, budgetMax: null, jobPhotos: [], intakeAnswers: null,
  }),
  submitQuote: jest.fn(),
}));
jest.mock('@/services/provider-crm.service', () => ({
  listTemplates: jest.fn().mockResolvedValue([
    { id: 'general', name: 'General Template', categoryId: null, subcategoryId: null, items: [] },
    { id: 'aircon', name: 'Aircon Template', categoryId: 'category-aircon', subcategoryId: 'subcategory-aircon', items: [] },
    { id: 'plumbing', name: 'Plumbing Template', categoryId: 'category-plumbing', subcategoryId: 'subcategory-plumbing', items: [] },
  ]),
}));

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

it('Bug UX-283 — quote builder offers only all-service or matching catalog templates for the current customer request', async () => {
  (api.get as jest.Mock).mockReset().mockResolvedValue({ data: { data: { tier: 'verified', commissionRate: 0.15 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByText('Use template'));
  expect(await screen.findByText('General Template')).toBeTruthy();
  expect(screen.getByText('Aircon Template')).toBeTruthy();
  expect(screen.queryByText('Plumbing Template')).toBeNull();
});
