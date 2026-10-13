// HA-M2-309 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// critique L4): two fan-outs for the same request running at the same moment
// (the post-commit fan-out and the worker's re-fan-out) neither deadlock nor
// double-notify: a per-request advisory lock orders them, and each provider
// gets one invite and one notice. Real concurrent fan-outs over real rows on
// the guarded PostgreSQL fixture (the fixture's lock_timeout of 12 s would
// turn a deadlock or lock pile-up into a failure).
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, insertQuoteRequest, addProvider, invitesOf, notificationsOf,
  providerC, providerUserA, providerUserB, providerUserC,
} from './helpers/request-flow-postgres';
import { notifyProvidersOfJobRequest } from '../src/services/job-leads.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-309: two concurrent fan-outs on one request: no deadlock, one push per provider', async () => {
  await withRequestFlowDatabase(async database => {
    await addProvider(database, { providerId: providerC, userId: providerUserC });
    const bookingId = await insertQuoteRequest(database);

    const results = await Promise.all([
      notifyProvidersOfJobRequest({ id: bookingId }),
      notifyProvidersOfJobRequest({ id: bookingId }),
    ]);

    expect(results.map(r => r.invited).sort()).toEqual([0, 3]);
    expect(await invitesOf(database, bookingId)).toHaveLength(3);
    for (const userId of [providerUserA, providerUserB, providerUserC]) {
      expect((await notificationsOf(database, userId)).map(n => n.type)).toEqual(['new_job_request']);
    }
  });
}, 90000);
