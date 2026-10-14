// HA-M3-06 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 73): an open-requests row reports the live wait since
// the current round opened, the round, the providers notified, the providers
// who opened it and the providers who sent a quote, for this round and in
// total, from job_request_invites (sent_at / status 'sent'), the quote
// counts, and "budget not sure" (budget_unknown), with the customer as
// "Ana R." and only barangay and city, never the street address. Real HTTP on
// the guarded PostgreSQL fixture with the real migrations 183-186.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  addProvider, customerA, insertQuote, insertQuoteRequest, providerA, providerB, providerC, providerD,
  providerUserC, providerUserD,
} from './helpers/request-flow-postgres';
import {
  adminUser, insertInvite, marketplaceAdminHttp, withMarketplaceDatabase,
} from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-06: an open request shows its wait since the round opened and the invite counts per round', async () => {
  await withMarketplaceDatabase(async database => {
    await addProvider(database, { providerId: providerC, userId: providerUserC });
    await addProvider(database, { providerId: providerD, userId: providerUserD });
    const bookingId = await insertQuoteRequest(database, {
      createdAgo: '1 hour', roundOpenedAgo: '6 minutes', round: 2, budgetUnknown: true,
    });
    // Round 1: provider A was notified, opened it and quoted; the customer declined.
    const declined = await insertQuote(database, {
      bookingId, providerId: providerA, status: 'declined', declineReason: 'too_expensive', round: 1,
    });
    await insertInvite(database, {
      bookingId, providerId: providerA, round: 1, status: 'declined', sentAgo: '55 minutes',
      viewedAfterMinutes: 2, respondedAfterMinutes: 9, quoteId: declined,
    });
    // Round 2: B notified and opened it, C notified only, D found it in their list.
    await insertInvite(database, { bookingId, providerId: providerB, round: 2, status: 'viewed', sentAgo: '6 minutes', viewedAfterMinutes: 1 });
    await insertInvite(database, { bookingId, providerId: providerC, round: 2, status: 'sent', sentAgo: '6 minutes' });
    await insertInvite(database, {
      bookingId, providerId: providerD, round: 2, source: 'inbox', status: 'viewed', sentAgo: '2 minutes', viewedAfterMinutes: 0,
    });

    const response = await marketplaceAdminHttp(adminUser, 'admin').get('/open-requests');

    expect(response.status).toBe(200);
    const roundOpenedAt = (await database.query<{ at: Date }>(
      'SELECT request_round_opened_at AS at FROM bookings WHERE id = $1', [bookingId],
    )).rows[0]!.at.toISOString();
    expect(response.body.data).toEqual([expect.objectContaining({
      bookingId,
      waitingSince: roundOpenedAt,
      waitMinutes: 6,
      waitingOn: 'providers',
      severity: 'amber',
      round: 2,
      maxRounds: 3,
      notified: 2,
      viewed: 2,
      responded: 0,
      notifiedTotal: 3,
      viewedTotal: 3,
      respondedTotal: 1,
      liveQuotes: 0,
      totalQuotes: 1,
      declinedQuotes: 1,
      budgetMinCentavos: null,
      budgetMaxCentavos: null,
      budgetUnknown: true,
      barangay: 'Kamputhaw',
      city: 'Cebu City',
      customer: { id: customerA, displayName: 'Ana R.' },
    })]);
    expect(JSON.stringify(response.body)).not.toContain('Mango Avenue');
  });
}, 90000);
