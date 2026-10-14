// R-CUS-08 (repair batch 1a): the customer approves a finished job from the
// shared work record card, but the card cut the checklist off after four items
// with a plain "+N more" line that could not be opened, and it never showed the
// notes the provider wrote when they submitted the job. The same card renders
// on the provider and staff job screens, so those screens are checked too.
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Icons are visual only. Every icon renders nothing, as in the Bug UX-309 card
// test, so the output is not buried under host-element casing warnings.
jest.mock('@/components/icons', () =>
  new Proxy({}, { get: (_target, name) => (typeof name === 'string' && name !== 'then' ? () => null : undefined) }),
);
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({ getCurrentLocation: jest.fn(), isLoading: false }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  ApiError: class ApiError extends Error {},
  default: {
    get: jest.fn().mockRejectedValue(new Error('offline in this test')),
    patch: jest.fn(),
    post: jest.fn(),
  },
}));
jest.mock('@/services/provider-api.service', () => ({ updateBookingStatus: jest.fn() }));
jest.mock('@/services/booking-photo.service', () => ({ listBookingPhotos: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/booking.service', () => ({
  getMyDisputes: jest.fn().mockResolvedValue({ disputes: [] }),
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1',
    customerId: 'customer-1',
    providerId: 'provider-1',
    bookingType: 'fixed_price',
    status: 'completed_by_provider',
    escrowStatus: 'held',
    servicePrice: 250000,
    serviceFee: 0,
    totalAmount: 250000,
    description: 'Deep clean, 2-bedroom condo',
    address: '42 Governor Cuenco Avenue',
    barangay: 'Kasambagan',
    city: 'Cebu City',
    province: 'Cebu',
    latitude: 10.3294,
    longitude: 123.9124,
    scheduledAt: '2026-10-10T01:00:00.000Z',
    completedAt: '2026-10-10T04:00:00.000Z',
    confirmedAt: null,
    cancelledAt: null,
    jobPhotos: [],
    providerBeforePhotos: [],
    providerAfterPhotos: [],
    createdAt: '2026-10-09T01:00:00.000Z',
    serviceName: 'Deep Cleaning',
    categoryName: 'Cleaning',
    customerName: 'Ana Customer',
  }),
}));

const itemTitles = [
  'Dust ceiling fans',
  'Wipe kitchen counters',
  'Clean bathroom tiles',
  'Mop living room floor',
  'Empty all trash bins',
  'Wipe window sills',
];
const providerNotes = 'Bedroom aircon filter was very dirty, so I rinsed it too.';

function makeSummary(
  { itemCount = itemTitles.length, completionNotes = providerNotes }: { itemCount?: number; completionNotes?: string | null } = {},
): BookingProofSummary {
  const titles = itemTitles.slice(0, itemCount);
  return {
    booking: {
      id: 'booking-1',
      status: 'completed_by_provider',
      description: 'Deep clean, 2-bedroom condo',
      workStartedAt: '2026-10-10T01:00:00.000Z',
      workCompletedAt: '2026-10-10T04:00:00.000Z',
      completedAt: '2026-10-10T04:00:00.000Z',
      confirmedAt: null,
      completionNotes,
    },
    readiness: {
      stage: 'provider_submitted',
      readyForProviderCompletion: false,
      minimumTimeOnSiteMinutes: 60,
      afterPhotosRequired: 2,
      blockers: [],
      qualityFlags: [],
    },
    checklist: {
      templateVersion: 1,
      shownAt: '2026-10-10T01:00:00.000Z',
      totalItems: titles.length,
      requiredItems: titles.length,
      completedRequiredItems: titles.length,
      complete: true,
      items: titles.map((title, index) => ({
        id: `item-${index + 1}`,
        title,
        required: true,
        photoRequired: false,
        completed: true,
        completedAt: '2026-10-10T03:00:00.000Z',
        photoId: null,
        notes: null,
      })),
    },
    photos: [],
    signatures: { identityCaveat: 'Authenticated uploader only.', records: [] },
    changeOrders: [],
    communications: { chatMessageCount: 0, supportTickets: [] },
    dispute: null,
  };
}

const mockGetBookingProofSummary = jest.fn();
jest.mock('@/services/booking-proof.service', () => ({
  getBookingProofSummary: (...args: unknown[]) => mockGetBookingProofSummary(...args),
}));

import ProofSummaryCard from '@/components/booking/ProofSummaryCard';
import type { BookingProofSummary } from '@/services/booking-proof.service';
import CustomerBookingDetailScreen from '../app/customer/booking/[id]';
import ProviderJobDetailScreen from '../app/provider/job/[id]';
import StaffJobDetailScreen from '../app/staff/job/[id]';

beforeEach(() => {
  mockGetBookingProofSummary.mockReset();
  mockGetBookingProofSummary.mockResolvedValue(makeSummary());
});

function expectOnlyFirstFourItems() {
  for (const title of itemTitles.slice(0, 4)) {
    expect(screen.getByText(title)).toBeTruthy();
  }
  expect(screen.queryByText('Empty all trash bins')).toBeNull();
  expect(screen.queryByText('Wipe window sills')).toBeNull();
}

// The react-native mock turns accessibilityLabel into aria-label, so a role
// query by name only checks the screen-reader label. The within() check makes
// sure the words the customer actually sees on the button say the same thing.
function getChecklistToggle(label: string): HTMLElement {
  const button = screen.getByRole('button', { name: label });
  expect(within(button).getByText(label)).toBeTruthy();
  return button;
}

it('Bug R-CUS-08 — the customer can open every checklist item, not just the first four', () => {
  render(<ProofSummaryCard summary={makeSummary()} audience="customer" />);
  expectOnlyFirstFourItems();

  fireEvent.click(getChecklistToggle('Show 2 more checklist items'));

  for (const title of itemTitles) {
    expect(screen.getByText(title)).toBeTruthy();
  }
});

it('Bug R-CUS-08 — the customer can fold the opened checklist back to four items', () => {
  render(<ProofSummaryCard summary={makeSummary()} audience="customer" />);
  fireEvent.click(getChecklistToggle('Show 2 more checklist items'));

  fireEvent.click(getChecklistToggle('Show fewer checklist items'));

  expectOnlyFirstFourItems();
  expect(getChecklistToggle('Show 2 more checklist items')).toBeTruthy();
});

it('Bug R-CUS-08 — one hidden item is offered as "Show 1 more checklist item"', () => {
  render(<ProofSummaryCard summary={makeSummary({ itemCount: 5 })} audience="customer" />);

  fireEvent.click(getChecklistToggle('Show 1 more checklist item'));

  expect(screen.getByText('Empty all trash bins')).toBeTruthy();
});

// Both sides of the cut-off are checked in one test. A list of four alone
// would also pass on the old card, which never had a button; the list of five
// proves the button now exists, and the list of four stops a pointless
// "Show 0 more checklist items" button from coming back.
it('Bug R-CUS-08 — the checklist button appears only when more than four items are on the list', () => {
  const { rerender } = render(<ProofSummaryCard summary={makeSummary({ itemCount: 4 })} audience="customer" />);
  for (const title of itemTitles.slice(0, 4)) {
    expect(screen.getByText(title)).toBeTruthy();
  }
  expect(screen.queryByRole('button', { name: /checklist item/ })).toBeNull();
  expect(screen.queryByText(/more checklist item/)).toBeNull();

  rerender(<ProofSummaryCard summary={makeSummary({ itemCount: 5 })} audience="customer" />);

  expect(getChecklistToggle('Show 1 more checklist item')).toBeTruthy();
});

it('Bug R-CUS-08 — the customer reads the provider completion notes under "Provider notes"', () => {
  render(<ProofSummaryCard summary={makeSummary()} audience="customer" />);

  expect(screen.getByText('Provider notes')).toBeTruthy();
  expect(screen.getByText(providerNotes)).toBeTruthy();
});

// Both sides are checked in one test. Blank notes alone would also pass on the
// old card, which never showed notes; the written notes prove they now show,
// and the blank notes stop an empty "Provider notes" heading (the trim).
it('Bug R-CUS-08 — the "Provider notes" section appears only when the provider wrote some text', () => {
  const { rerender } = render(
    <ProofSummaryCard summary={makeSummary({ completionNotes: '   \n ' })} audience="customer" />,
  );
  expect(screen.queryByText('Provider notes')).toBeNull();

  rerender(<ProofSummaryCard summary={makeSummary({ completionNotes: providerNotes })} audience="customer" />);

  expect(screen.getByText('Provider notes')).toBeTruthy();
  expect(screen.getByText(providerNotes)).toBeTruthy();
});

const screensThatShowTheCard: Array<[string, React.ComponentType]> = [
  ['customer booking screen', CustomerBookingDetailScreen],
  ['provider job screen', ProviderJobDetailScreen],
  ['staff job screen', StaffJobDetailScreen],
];

function renderScreen(Screen: React.ComponentType) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Screen />
    </QueryClientProvider>,
  );
}

it.each(screensThatShowTheCard)('Bug R-CUS-08 — on the %s the work record opens every checklist item', async (_name, Screen) => {
  renderScreen(Screen);
  expect(await screen.findByText('Dust ceiling fans')).toBeTruthy();
  expectOnlyFirstFourItems();

  fireEvent.click(getChecklistToggle('Show 2 more checklist items'));

  for (const title of itemTitles) {
    expect(screen.getByText(title)).toBeTruthy();
  }
});

it.each(screensThatShowTheCard)('Bug R-CUS-08 — on the %s the work record shows the provider completion notes', async (_name, Screen) => {
  renderScreen(Screen);

  expect(await screen.findByText(providerNotes)).toBeTruthy();
  expect(screen.getByText('Provider notes')).toBeTruthy();
});
