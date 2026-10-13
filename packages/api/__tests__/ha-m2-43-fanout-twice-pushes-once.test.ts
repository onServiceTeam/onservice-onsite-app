// HA-M2-43 (customer human audit 2026-10-13, D38 Milestone 2, package P2):
// running the fan-out for the same round twice (a retry, or the worker's
// re-fan-out after a restart) notifies each provider once. The invite insert
// reports only rows it created, and only those are pushed. Real fan-out over
// real rows on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, insertQuoteRequest, invitesOf, notificationsOf, providerUserA, providerUserB,
} from './helpers/request-flow-postgres';
import { notifyProvidersOfJobRequest } from '../src/services/job-leads.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-43: running the fan-out twice pushes each provider once', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);

    const first = await notifyProvidersOfJobRequest({ id: bookingId });
    const second = await notifyProvidersOfJobRequest({ id: bookingId });

    expect(first).toMatchObject({ invited: 2, notified: 2 });
    expect(second).toMatchObject({ candidates: 2, invited: 0, notified: 0 });
    expect(await invitesOf(database, bookingId)).toHaveLength(2);
    for (const userId of [providerUserA, providerUserB]) {
      expect((await notificationsOf(database, userId)).map(n => n.type)).toEqual(['new_job_request']);
    }
  });
}, 90000);
