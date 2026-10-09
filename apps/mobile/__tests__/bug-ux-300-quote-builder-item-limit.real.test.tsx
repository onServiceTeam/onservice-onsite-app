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
  getProviderJobRequest: jest.fn().mockResolvedValue({
    id: 'booking-1', categoryId: 'category-aircon', subcategoryId: 'subcategory-aircon',
    serviceName: 'Aircon repair', description: 'Aircon is not cooling', urgency: null,
    budgetMin: null, budgetMax: null, jobPhotos: [], intakeAnswers: null,
  }),
  submitQuote: jest.fn(),
}));
jest.mock('@/services/provider-crm.service', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
}));

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

it('Bug UX-300 — quote builder stops at the same 20 line-item limit enforced by the API', async () => {
  (api.get as jest.Mock).mockReset().mockResolvedValue({ data: { data: { tier: 'verified', commissionRate: 0.15 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);

  await screen.findByText('Aircon repair');
  const addButton = screen.getByText('+ Add Item');
  for (let index = 0; index < 25; index += 1) fireEvent.click(addButton);

  expect(screen.getAllByPlaceholderText('Item description')).toHaveLength(20);
  expect(screen.getByText('Maximum 20 line items per quote.')).toBeTruthy();
});
