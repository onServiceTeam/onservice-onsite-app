// HA-M2-58 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// merged plan question 11 default): before booking, a provider sees the
// customer as first name and last initial ("Ana R."), never the full
// surname. Real HTTP through the mounted provider list route on the guarded
// PostgreSQL fixture (customer A is Ana Reyes).
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-58: the lead shows the customer as "Ana R."', async () => {
  await withRequestFlowDatabase(async database => {
    await insertQuoteRequest(database);

    const list = await flowHttp(providerUserA, 'provider').leads();

    expect(list.status).toBe(200);
    expect(list.body.requests.map((r: { customerName: string }) => r.customerName)).toEqual(['Ana R.']);
    expect(JSON.stringify(list.body)).not.toContain('Reyes');
  });
}, 90000);
