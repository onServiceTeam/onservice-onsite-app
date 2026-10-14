// HA-M3-36 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API;
// design-admin.md test 98): provider responsiveness counts only real
// responses, an invite linked to the quote the provider sent. Provider A had
// four invites: one quoted after 10 minutes, one whose quote the customer
// later declined (sent after 20 minutes, still a response), and two closed
// without a quote (expired, taken) that nonetheless carry a responded_at
// stamp after 1 and 2 minutes. GET /admin/marketplace-health/providers
// reports 4 invites, 2 responses, a 0.5 response rate and a median of 15
// minutes: the stamps on the closed invites are ignored. Real HTTP on the
// guarded PostgreSQL fixture.
import type { Pool } from 'pg';
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { insertQuote, insertQuoteRequest, providerA } from './helpers/request-flow-postgres';
import {
  adminUser, insertInvite, marketplaceAdminHttp, withMarketplaceDatabase, type InviteSpec,
} from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

async function inviteOnNewRequest(database: Pool, spec: Omit<InviteSpec, 'bookingId' | 'providerId'>, quote?: 'live' | 'declined') {
  const bookingId = await insertQuoteRequest(database, { createdAgo: '2 hours' });
  const quoteId = quote === undefined ? null : await insertQuote(database, {
    bookingId, providerId: providerA, ...(quote === 'declined' ? { status: 'declined', declineReason: 'timing' } : {}),
  });
  await insertInvite(database, { bookingId, providerId: providerA, sentAgo: '90 minutes', viewedAfterMinutes: 1, quoteId, ...spec });
}

it('HA-M3-36: responsiveness ignores responded_at on expired or taken invites', async () => {
  await withMarketplaceDatabase(async database => {
    await inviteOnNewRequest(database, { status: 'quoted', respondedAfterMinutes: 10 }, 'live');
    await inviteOnNewRequest(database, { status: 'declined', respondedAfterMinutes: 20 }, 'declined');
    await inviteOnNewRequest(database, { status: 'expired', respondedAfterMinutes: 2 });
    await inviteOnNewRequest(database, { status: 'taken', respondedAfterMinutes: 1 });

    const response = await marketplaceAdminHttp(adminUser, 'admin').get('/providers');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([expect.objectContaining({
      providerId: providerA,
      providerName: 'Synthetic Aircon Team A',
      invites: 4,
      notified: 4,
      viewed: 4,
      responded: 2,
      viewedRate: 1,
      responseRate: 0.5,
      medianResponseMinutes: 15,
      quotesAccepted: 0,
    })]);
    expect(response.body.meta).toMatchObject({ total: 1, sort: 'invites' });
  });
}, 90000);
