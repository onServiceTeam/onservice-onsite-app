// HA-REQ-11 (customer human audit 2026-10-13, D38): "Use the customer's
// budget" prices the quote at the top of the customer's range in one tap.
//
// D38 Milestone 2 (package P5b): the server now decides the price of an
// accepted budget (merged plan conflict 7): the form sends acceptBudget with
// the budget amount it showed, and the server sets the quote to the
// customer's budget_max (refusing a mismatch). The provider still reviews and
// sends the quote as normal.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NOW } from '../test-support/request-fixtures';

const mockSubmitQuote = jest.fn().mockResolvedValue({ id: 'quote-1' });
let mockBudget: { budgetMin: number | null; budgetMax: number | null; budgetUnknown?: boolean } = { budgetMin: 150000, budgetMax: 250000 };

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/request.service', () => ({
  ...jest.requireActual('@/services/request.service'),
  getProviderJobRequest: jest.fn().mockImplementation(async () => ({
    id: 'booking-1', categoryId: 'category-1', subcategoryId: 'subcategory-1',
    categoryName: 'Aircon Services', serviceName: 'Aircon repair',
    description: 'Bedroom aircon blows warm air.', urgency: 'within_3_days',
    ...mockBudget,
    jobPhotos: [], jobVideoUrl: null, intakeAnswers: null, intakeQuestions: [],
    barangay: 'Lahug', city: 'Cebu City', province: 'Cebu', customerName: 'Ana C.',
    distanceKm: 2.1, createdAt: '2026-10-13T01:00:00.000Z', myQuote: null,
  })),
  submitQuote: (...args: unknown[]) => mockSubmitQuote(...args),
  getBookingQuotes: jest.fn().mockResolvedValue([]),
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
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => jest.restoreAllMocks());

it("HA-REQ-11: \"Use the customer's budget\" fills the quote price with the budget maximum", async () => {
  renderScreen();

  fireEvent.click(await screen.findByRole('button', { name: "Use the customer's budget" }));

  expect(screen.getByText("You are accepting the customer's budget of ₱2,500.00.")).toBeTruthy();
  // The own-price field is replaced while the budget is accepted ...
  expect(screen.queryByLabelText('Total price in pesos')).toBeNull();
  // ... and the quote the customer would see equals the top of their range.
  expect(screen.getByText('₱2,500.00')).toBeTruthy();
});

it('HA-REQ-11: after the prefill the provider still submits normally and the quote carries the budget price', async () => {
  renderScreen();

  fireEvent.click(await screen.findByRole('button', { name: "Use the customer's budget" }));
  fireEvent.change(screen.getByLabelText('What is included'), {
    target: { value: 'Clean, re-gas and check the drain line of one unit.' },
  });
  fireEvent.click(screen.getByRole('radio', { name: 'Tomorrow, Thu 15 Oct' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Afternoon (12 PM to 5 PM)' }));
  const submit = screen.getByRole('button', { name: 'Send quote' }) as HTMLButtonElement;
  await waitFor(() => expect(submit.disabled).toBe(false));
  fireEvent.click(submit);

  await waitFor(() => expect(mockSubmitQuote).toHaveBeenCalledTimes(1));
  const [bookingId, body] = mockSubmitQuote.mock.calls[0] as [string, Record<string, unknown>];
  expect(bookingId).toBe('booking-1');
  expect(body).toMatchObject({ quotedPrice: 250000, acceptBudget: true });
  expect(body.lineItems).toBeUndefined();
});

it("HA-REQ-11: there is no \"Use the customer's budget\" button when the customer is not sure of the price", async () => {
  mockBudget = { budgetMin: null, budgetMax: null, budgetUnknown: true };
  renderScreen();

  expect(await screen.findByText('Customer is not sure of the price')).toBeTruthy();
  expect(screen.queryByRole('button', { name: "Use the customer's budget" })).toBeNull();
});
