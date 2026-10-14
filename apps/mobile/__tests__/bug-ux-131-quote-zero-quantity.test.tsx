import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NOW } from '../test-support/request-fixtures';

const mockSubmitQuote = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
// D38 Milestone 2 (P5b): the lead detail and the quote go through request.service.
jest.mock('@/services/request.service', () => ({
  ...jest.requireActual('@/services/request.service'),
  getProviderJobRequest: jest.fn().mockResolvedValue({
    id: 'booking-1', serviceName: 'Repair', description: 'Repair the leaking drain.',
    urgency: null, budgetMin: null, budgetMax: null, jobPhotos: [], intakeAnswers: null,
  }),
  submitQuote: (...args: unknown[]) => mockSubmitQuote(...args),
  getBookingQuotes: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/provider-crm.service', () => ({ listTemplates: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: { tier: 'pro', commissionRate: 0.11 } } }) },
}));

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

afterEach(() => jest.restoreAllMocks());

// D38 Milestone 2 (P5b): line items sit behind "Add an itemized breakdown",
// and a quote also needs "What is included" and the earliest slot. Those are
// filled in here so the zero quantity is the only thing blocking the send.
it('Bug UX-131 — zero-quantity quote line cannot be previewed as zero and submitted as one', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);

  await screen.findByText('Repair');
  fireEvent.click(screen.getByRole('switch', { name: 'Add an itemized breakdown' }));
  fireEvent.change(screen.getByLabelText('What is included'), { target: { value: 'Replace the damaged drain safely.' } });
  fireEvent.click(screen.getByRole('radio', { name: 'Tomorrow, Thu 15 Oct' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Morning (8 AM to 12 PM)' }));
  fireEvent.change(screen.getByPlaceholderText('Item description'), { target: { value: 'Labor' } });
  fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '0' } });
  fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1000' } });

  expect(screen.getByText(/quantity must be at least 0.01/i)).toBeTruthy();
  const submit = screen.getByRole('button', { name: 'Send quote' }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  fireEvent.click(submit);
  expect(mockSubmitQuote).not.toHaveBeenCalled();
});
