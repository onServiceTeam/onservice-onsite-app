jest.mock('../src/models/db', () => ({ db: { query: jest.fn() } }));

import { db } from '../src/models/db';
import { searchAdminRecords } from '../src/services/admin-search.service';

const queryMock = db.query as jest.Mock;

it('Bug OPS-397 - global operator search opens the exact payment attempt without returning its gateway identifier', async () => {
  queryMock.mockImplementation(async (sql: string) => ({
    rows: sql.includes('FROM payment_intents pi') ? [{
      id: '39700000-0000-4000-8000-000000000397',
      title: '39700000-0000-4000-8000-000000000397',
      context: 'Booking 39700000 · Payment Customer · GCASH',
      status: 'succeeded',
      phone: null,
      email: null,
      related_id: '39700000-0000-4000-8000-000000003970',
      rank: 0,
      created_at: new Date('2026-09-03T03:00:00.000Z'),
    }] : [],
  }));

  const results = await searchAdminRecords('pi_private_ops_397');

  expect(results).toEqual([{
    kind: 'payment',
    id: '39700000-0000-4000-8000-000000000397',
    title: 'Payment 39700000',
    subtitle: 'Booking 39700000 · Payment Customer · GCASH · succeeded',
    status: 'succeeded',
    to: '/financials?tab=payments&intentSearch=39700000-0000-4000-8000-000000000397',
  }]);
  expect(JSON.stringify(results)).not.toContain('pi_private_ops_397');
  expect(queryMock).toHaveBeenCalledTimes(12);
  const paymentQuery = queryMock.mock.calls.find(([sql]) => (
    typeof sql === 'string' && sql.includes('FROM payment_intents pi')
  ));
  expect(paymentQuery?.[0]).toMatch(/paymongo_intent_id/);
  expect(paymentQuery?.[0]).toMatch(/paymongo_payment_id/);
  expect(paymentQuery?.[1]).toEqual(['pi_private_ops_397', '', 4]);
});
