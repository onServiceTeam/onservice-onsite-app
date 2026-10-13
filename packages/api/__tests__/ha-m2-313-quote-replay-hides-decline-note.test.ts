// HA-M2-313 (customer human audit 2026-10-13, D38 Milestone 2, package P2
// review fix; P2 overflow number, see HA-M2-310): the customer's decline note
// is never shown to a provider (merged plan 2.3 and 2.5: it may hold contact
// details). A provider app that retries a quote with the same
// clientRequestId after the customer declined it gets its stored quote back
// (critique L2 answers the replay before any status check); that replay used
// to return the raw quote row, decline_note included. Real HTTP on the
// guarded PostgreSQL fixture.
import crypto from 'node:crypto';
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, quoteBody, customerA, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const privateNote = 'Private: text me on 0917 555 0101 instead';

it('HA-M2-313: a quote replay after a decline never returns the customer\'s decline note', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    const clientRequestId = crypto.randomUUID();
    const provider = flowHttp(providerUserA, 'provider');
    const first = await provider.quote(bookingId, quoteBody({ clientRequestId }));
    expect(first.status).toBe(201);
    expect((await flowHttp(customerA, 'customer').decline(bookingId, first.body.data.id, {
      reason: 'other', note: privateNote,
    })).status).toBe(200);
    expect((await database.query('SELECT decline_note FROM booking_quotes WHERE id = $1', [first.body.data.id])).rows)
      .toEqual([{ decline_note: privateNote }]);

    const retry = await provider.quote(bookingId, quoteBody({ clientRequestId }));

    expect(retry.status).toBe(200);
    expect(retry.body.data).toMatchObject({ id: first.body.data.id, status: 'declined', replayed: true });
    expect(retry.body.data).not.toHaveProperty('decline_note');
    expect(JSON.stringify(retry.body)).not.toContain('0917 555 0101');
  });
}, 90000);
