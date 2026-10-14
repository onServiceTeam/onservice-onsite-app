// R-PRV-08: on the provider Profile tab the whole Schedule card was hidden
// when the provider had no working-hours rows (profile.schedule empty), so a
// provider with no hours never learned what that costs them.
//
// What the server really does (checked 2026-10-14 before writing the copy):
//   - Automatic job offers (booking-offer.service kickOfferCycle ->
//     matching.service findMatchingProviders) only match a provider whose
//     provider_availability rows with is_available = TRUE, or a custom-hours
//     date override, cover the booking time. No weekly hours means no
//     automatic job offers, except on a date with custom hours.
//   - A provider can have rows and still have no hours: the schedule screen
//     always saves all 7 days, and the server stores days switched off as
//     rows with is_available = false. A week with every day off is accepted.
//     Matching treats that the same as no rows, so the card must too.
//   - Customer quote requests (job-leads.service notifyProvidersOfJobRequest
//     and the Requests list, both using booking/request-eligibility.ts) do NOT
//     look at working hours. Request-first booking is on by default, so a
//     provider with no hours still gets customer requests.
// So the card must not say "you will not get jobs". It says automatic job
// offers will not come on days without hours and that customer requests can
// still reach them.
//
// Real render test: mounts the real Profile tab with a mocked profile API and
// reads what the provider would see.

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    user: { firstName: 'Juan', lastName: 'Provider', phone: '+639171234567' },
    logout: jest.fn(),
  }),
}));

const mockGetMyProfile = jest.fn();
jest.mock('@/services/provider-api.service', () => ({
  getMyProfile: (...args: unknown[]) => mockGetMyProfile(...args),
  updateMyProfile: jest.fn(),
}));

import ProviderProfileScreen from '../app/(provider-tabs)/provider-profile';

const NO_HOURS_TITLE = 'No weekly working hours set.';
const NO_HOURS_BODY =
  'You will not get automatic job offers on days without working hours. '
  + 'Customer requests can still reach you in the Requests tab.';
// Everything the no-hours card shows, in order: heading, link, title, body.
// Comparing the whole text means no extra (possibly untrue) sentence can be
// added to the card without this test noticing.
const NO_HOURS_CARD_TEXT = `ScheduleAdd hours${NO_HOURS_TITLE}${NO_HOURS_BODY}`;

// What the schedule screen saves when the provider switches every day off:
// all 7 days, each with is_available false.
const ALL_DAYS_OFF = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  id: `slot-${day}`, dayOfWeek: day, startTime: '08:00', endTime: '17:00', isAvailable: false,
}));

function profileWithSchedule(schedule: unknown[]): Record<string, unknown> {
  return {
    id: 'provider-1', userId: 'user-1', businessName: 'Juan Services', tier: 'verified',
    status: 'approved', bio: 'Home services', rating: 4.8, totalJobs: 12,
    acceptanceRate: 90, responseTimeMinutes: 4, yearsExperience: 5,
    serviceRadiusKm: 15, isAvailable: true, latitude: 10.3236, longitude: 123.9223,
    city: 'Mandaue', province: 'Cebu', createdAt: '2026-01-01T00:00:00.000Z',
    services: [], schedule, ratings: { overall: 4.8, totalReviews: 10 },
    portfolio: [], certifications: [],
  };
}

// Mount the Profile tab and return the Schedule card (the box around the
// "Schedule" heading), or null when the card is not on screen.
async function renderAndFindScheduleCard(schedule: unknown[]): Promise<HTMLElement | null> {
  mockGetMyProfile.mockResolvedValue(profileWithSchedule(schedule));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <ProviderProfileScreen />
    </QueryClientProvider>,
  );
  // Wait for the profile to load (the About card renders from it), so a
  // missing Schedule card is a real absence and not a still-loading screen.
  expect(await screen.findByText('About')).toBeTruthy();
  const headings = screen.queryAllByText('Schedule');
  // Exactly one Schedule card, whatever the provider's hours are.
  expect(headings.length).toBeLessThanOrEqual(1);
  if (headings.length === 0) return null;
  // heading -> section header row -> Schedule card
  return headings[0]!.parentElement?.parentElement ?? null;
}

describe('R-PRV-08 — Profile tab tells a provider with no working hours what that means (real render)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Bug R-PRV-08 — with no working-hours rows the Schedule card still shows and says no weekly hours are set', async () => {
    const card = await renderAndFindScheduleCard([]);

    expect(card).not.toBeNull();
    expect(card!.textContent).toContain(NO_HOURS_TITLE);
  });

  it('Bug R-PRV-08 — the no-hours card shows exactly the truthful wording and nothing else', async () => {
    const card = await renderAndFindScheduleCard([]);

    expect(card).not.toBeNull();
    // Automatic offers need hours, quote requests do not (see top of file).
    expect(card!.textContent).toBe(NO_HOURS_CARD_TEXT);
  });

  it('Bug R-PRV-08 — the no-hours card has an Add hours link that opens the schedule screen', async () => {
    const card = await renderAndFindScheduleCard([]);

    expect(card).not.toBeNull();
    const addHours = Array.from(card!.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === 'Add hours',
    );
    expect(addHours).toBeTruthy();
    fireEvent.click(addHours!);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/provider/schedule');
  });

  it('Bug R-PRV-08 — a provider who saved every day as off sees the same no-hours card', async () => {
    const card = await renderAndFindScheduleCard(ALL_DAYS_OFF);

    expect(card).not.toBeNull();
    expect(card!.textContent).toBe(NO_HOURS_CARD_TEXT);
  });

  it('Bug R-PRV-08 — a provider with working hours sees only their open days and no no-hours warning', async () => {
    const card = await renderAndFindScheduleCard([
      { id: 'slot-1', dayOfWeek: 1, startTime: '08:00', endTime: '17:00', isAvailable: true },
      { id: 'slot-2', dayOfWeek: 2, startTime: '08:00', endTime: '17:00', isAvailable: false },
    ]);

    expect(card).not.toBeNull();
    expect(card!.textContent).toBe('ScheduleEditMon08:00 – 17:00');
  });
});
