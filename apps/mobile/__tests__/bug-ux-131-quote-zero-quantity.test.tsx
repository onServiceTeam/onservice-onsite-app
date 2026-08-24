import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockSubmitQuote = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1', serviceName: 'Repair', description: 'Repair the leaking drain.',
    urgency: null, budgetMin: null, budgetMax: null, jobPhotos: [], intakeAnswers: null,
  }),
  submitQuote: (...args: unknown[]) => mockSubmitQuote(...args),
}));
jest.mock('@/services/provider-crm.service', () => ({ listTemplates: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: { tier: 'pro', commissionRate: 0.11 } } }) },
}));

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

it('Bug UX-131 — zero-quantity quote line cannot be previewed as zero and submitted as one', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);

  await screen.findByText('Repair');
  fireEvent.change(screen.getByPlaceholderText('Describe what the quote covers, scope of work, approach...'), { target: { value: 'Replace the damaged drain safely.' } });
  fireEvent.change(screen.getByPlaceholderText('Item description'), { target: { value: 'Labor' } });
  fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '0' } });
  fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1000' } });

  expect(screen.getByText(/quantity must be at least 0.01/i)).toBeTruthy();
  const submit = screen.getByText('Submit Quote').closest('button');
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(submit!);
  expect(mockSubmitQuote).not.toHaveBeenCalled();
});
