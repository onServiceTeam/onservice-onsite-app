// HA-M2-57 (customer human audit 2026-10-13, D38 Milestone 2, package P2): the
// provider's Requests summary (the tab badge) counts open requests they have
// not opened yet; opening one request's detail lowers the unseen count by
// one while the open count stays the same. Real HTTP through the mounted
// provider routes on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, providerUserB,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-57: the summary unseen count drops after a detail open', async () => {
  await withRequestFlowDatabase(async database => {
    const first = await insertQuoteRequest(database);
    await insertQuoteRequest(database);
    const provider = flowHttp(providerUserB, 'provider');
    const before = await provider.leadSummary();
    expect(before.status).toBe(200);
    expect(before.body.data).toEqual({ openCount: 2, unseenCount: 2, quotesWaitingCount: 0, isAvailable: true });

    expect((await provider.lead(first)).status).toBe(200);

    expect((await provider.leadSummary()).body.data).toEqual({ openCount: 2, unseenCount: 1, quotesWaitingCount: 0, isAvailable: true });
  });
}, 90000);
