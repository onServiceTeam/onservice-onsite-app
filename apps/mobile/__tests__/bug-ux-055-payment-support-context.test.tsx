import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({
    bookingId: '11111111-1111-4111-8111-111111111111',
    reason: 'The payment provider declined this attempt.',
  }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ status: 'payment_pending', createdAt: new Date().toISOString() }),
}));

import PaymentFailedScreen from '../app/customer/booking/payment-failed';

it('Bug UX-055 — payment failure opens a prefilled support case linked to the affected booking', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><PaymentFailedScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Contact support about payment failure' }));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/support/new',
    params: {
      bookingId: '11111111-1111-4111-8111-111111111111',
      type: 'payment_issue',
      subject: 'Payment failed for my booking',
      description: 'The payment provider declined this attempt.',
    },
  });
});
