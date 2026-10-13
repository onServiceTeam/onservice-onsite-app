// HA-M2-34 (customer human audit 2026-10-13, D38 Milestone 2, package P2): an
// itemized quote that also carries the earliest slot stores the line-item
// total as its price (the client's quotedPrice is ignored, as before D38),
// stores the slot, and stores each line. Real HTTP on the guarded PostgreSQL
// fixture (quote_line_items in its migration 018 shape).
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, quoteBody, platformDate, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-34: an itemized quote with a slot keeps the line-item total', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);

    const response = await flowHttp(providerUserA, 'provider').quote(bookingId, quoteBody({
      quotedPrice: 999999,
      earliestDate: platformDate(4),
      earliestTimeWindow: 'evening',
      lineItems: [
        { description: 'Labor', quantity: 2, unit: 'hour', unitPrice: 10000, itemType: 'labor' },
        { description: 'Drain parts', quantity: 1.5, unit: 'set', unitPrice: 20000, itemType: 'materials' },
      ],
    }));

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ quoted_price: 50000, laborAmount: 20000, materialsAmount: 30000 });
    expect((await database.query(`SELECT quoted_price::int AS price, to_char(earliest_date, 'YYYY-MM-DD') AS earliest_date,
        earliest_time_window FROM booking_quotes WHERE id = $1`, [response.body.data.id])).rows)
      .toEqual([{ price: 50000, earliest_date: platformDate(4), earliest_time_window: 'evening' }]);
    expect((await database.query(`SELECT description, line_total::int AS total FROM quote_line_items
      WHERE quote_id = $1 ORDER BY line_total`, [response.body.data.id])).rows)
      .toEqual([{ description: 'Labor', total: 20000 }, { description: 'Drain parts', total: 30000 }]);
  });
}, 90000);
