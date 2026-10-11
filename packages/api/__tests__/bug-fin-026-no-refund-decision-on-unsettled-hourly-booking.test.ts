import { isDeepStrictEqual } from 'node:util';
import type { Pool } from 'pg';
import { logger } from '../src/utils/logger';
import {
  withMoneyDisputeDatabase, heldFor, fileDisputeHttp, adminResolveHttp, hourlyUnsettledB, decisionSnapshot, decisionRefusalLog,
} from './helpers/money-dispute-postgres';
import { bookingIntegrationIt as it, bookingB, providerUserB } from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

async function providerWallet(database: Pool): Promise<number> {
  return Number((await database.query<{ b: string }>(`SELECT COALESCE(SUM(available_balance),0)::text AS b
    FROM wallets WHERE type='provider' AND user_id=$1`, [providerUserB])).rows[0]!.b);
}

// Booking B is hourly: two hours estimated, one worked. The settlement that
// bills the worked hours runs only when the customer confirms, and a
// dispute comes before that. A "no refund" decision used to release the
// whole estimate: the provider was paid 680,000 for two hours, and the
// customer's unused hour was never refunded. What a decision should mean on
// an unsettled hourly booking is Ken's (D36 Q10); until then it is held back.
it('Bug FIN-026 - a no-refund decision on an hourly booking not yet settled to the hours worked is held back', async () => {
  await withMoneyDisputeDatabase(async database => {
    await hourlyUnsettledB(database);
    const filed = await fileDisputeHttp()(bookingB);
    expect(filed.status).toBe(201);
    const before = await decisionSnapshot(database);

    const decided = await adminResolveHttp()(filed.body.data.id, { resolutionType: 'no_refund' });

    expect({
      status: decided.status,
      error: decided.body.error,
      unchanged: isDeepStrictEqual(await decisionSnapshot(database), before),
      dispute: (await database.query('SELECT status FROM disputes WHERE booking_id=$1', [bookingB])).rows,
      heldB: await heldFor(database, bookingB),
      provider: await providerWallet(database),
      logged: (logger.warn as jest.Mock).mock.calls.filter(([message]) => message === decisionRefusalLog).map(([, details]) => details),
    }).toEqual({
      status: 409,
      error: {
        statusCode: 409,
        code: 'DISPUTE_HOURLY_UNSETTLED',
        message: 'This hourly booking has not been settled to the hours worked, so this decision would pay the provider for the estimated hours. Nothing was recorded or moved. Until the owner decides how hourly disputes are counted, only a full refund can be decided; otherwise leave the dispute open.',
      },
      unchanged: true,
      dispute: [{ status: 'open' }],
      heldB: 1000000,
      provider: 0,
      logged: [{
        code: 'DISPUTE_HOURLY_UNSETTLED', disputeId: filed.body.data.id, bookingId: bookingB,
        resolutionType: 'no_refund', refundCentavos: 0, heldCentavos: 1000000, totalCentavos: 1000000,
        escrowStatus: 'held',
      }],
    });
  });
}, 60000);
