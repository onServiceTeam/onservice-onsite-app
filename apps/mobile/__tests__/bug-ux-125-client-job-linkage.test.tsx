import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'customer-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 920, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/services/provider-crm.service', () => ({
  getClientDetail: jest.fn().mockResolvedValue({
    customerId: 'customer-1', customerName: 'Maria Santos', notes: [], reminders: [],
    bookings: [{ id: 'booking-1', status: 'confirmed', servicePrice: 125_000, categoryName: 'Aircon Cleaning', createdAt: '2026-08-20T00:00:00.000Z' }],
  }),
  addClientNote: jest.fn(), deleteClientNote: jest.fn(), addReminder: jest.fn(), completeReminder: jest.fn(),
}));

import ClientDetailScreen from '../app/provider/clients/[id]';

it('Bug UX-125 — tablet client record splits CRM and job history while keeping each booking operable', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ClientDetailScreen /></QueryClientProvider>);

  expect(await screen.findByText('Client record')).toBeTruthy();
  expect(screen.getByText(/1 job · 1 completed · ₱1,250.00 gross service value/i)).toBeTruthy();
  expect(screen.getByLabelText('Wide client relationship workspace')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Open Aircon Cleaning job'));
  expect(mockPush).toHaveBeenCalledWith('/provider/job/booking-1');
});
