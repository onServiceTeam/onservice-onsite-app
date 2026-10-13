// HA-REQ-11 (customer human audit 2026-10-13, D38): "Use the customer's
// budget" prices the quote at the top of the customer's range in one tap. It
// only fills the form; the provider still reviews and submits as normal.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockSubmitQuote = jest.fn().mockResolvedValue({ id: 'quote-1' });
let mockBudget: { budgetMin: number | null; budgetMax: number | null } = { budgetMin: 150000, budgetMax: 250000 };

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/booking.service', () => ({
  getProviderJobRequest: jest.fn().mockImplementation(async () => ({
    id: 'booking-1', categoryId: 'category-1', subcategoryId: 'subcategory-1',
    categoryName: 'Aircon Services', serviceName: 'Aircon repair',
    description: 'Bedroom aircon blows warm air.', urgency: 'within_3_days',
    ...mockBudget,
    jobPhotos: [], jobVideoUrl: null, intakeAnswers: null, intakeQuestions: [],
    barangay: 'Lahug', city: 'Cebu City', province: 'Cebu', customerName: 'Ana Cruz',
    distanceKm: 2.1, createdAt: '2026-10-13T01:00:00.000Z',
  })),
  submitQuote: (...args: unknown[]) => mockSubmitQuote(...args),
}));
jest.mock('@/services/provider-crm.service', () => ({ listTemplates: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: { tier: 'new', commissionRate: 0.15 } } }) },
}));

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

function renderScreen(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);
}

beforeEach(() => {
  mockBudget = { budgetMin: 150000, budgetMax: 250000 };
  mockSubmitQuote.mockClear();
});

it("HA-REQ-11: \"Use the customer's budget\" fills the quote price with the budget maximum", async () => {
  renderScreen();

  fireEvent.click(await screen.findByRole('button', { name: "Use the customer's budget" }));

  expect((screen.getByPlaceholderText('0.00') as HTMLInputElement).value).toBe('2500');
  expect((screen.getByPlaceholderText('Item description') as HTMLInputElement).value)
    .toBe('Job as described in the customer request');
  expect(screen.getAllByPlaceholderText('Item description')).toHaveLength(1);
  // The total the customer would pay now equals the top of their range.
  expect(screen.getByText('₱2,500.00')).toBeTruthy();
});

it('HA-REQ-11: after the prefill the provider still submits normally and the line item carries the budget price', async () => {
  renderScreen();

  fireEvent.click(await screen.findByRole('button', { name: "Use the customer's budget" }));
  fireEvent.change(screen.getByPlaceholderText('Describe what the quote covers, scope of work, approach...'), {
    target: { value: 'Clean, re-gas and check the drain line of one unit.' },
  });
  const submit = screen.getByText('Submit Quote').closest('button') as HTMLButtonElement;
  await waitFor(() => expect(submit.disabled).toBe(false));
  fireEvent.click(submit);

  await waitFor(() => expect(mockSubmitQuote).toHaveBeenCalledTimes(1));
  expect(mockSubmitQuote).toHaveBeenCalledWith('booking-1', expect.objectContaining({
    quotedPrice: 250000,
    lineItems: [expect.objectContaining({ quantity: 1, unit: 'job', unitPrice: 250000 })],
  }));
});

it("HA-REQ-11: there is no \"Use the customer's budget\" button when the customer is not sure of the price", async () => {
  mockBudget = { budgetMin: null, budgetMax: null };
  renderScreen();

  expect(await screen.findByText('Customer is not sure of the price')).toBeTruthy();
  expect(screen.queryByRole('button', { name: "Use the customer's budget" })).toBeNull();
});
