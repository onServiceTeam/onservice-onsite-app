jest.mock('../src/models/db', () => ({ db: { query: jest.fn() } }));

import { db } from '../src/models/db';
import { searchAdminRecords } from '../src/services/admin-search.service';

const queryMock = db.query as jest.Mock;

it('Bug OPS-394 - global operator search finds payment evidence but returns only the exact commercial statement handoff', async () => {
  queryMock.mockImplementation(async (sql: string) => ({
    rows: sql.includes('FROM business_invoices bi') ? [{
      id: '33333333-3333-4333-8333-333333333333',
      title: 'STMT-2026-0903',
      context: 'Cebu Build Co · Aug 01, 2026 to Aug 31, 2026',
      status: 'sent',
      phone: null,
      email: null,
      related_id: '11111111-1111-4111-8111-111111111111',
      rank: 0,
      created_at: new Date('2026-09-03T01:00:00.000Z'),
    }] : [],
  }));

  const results = await searchAdminRecords('BANK-PRIVATE-REFERENCE-394');

  expect(results).toEqual([{
    kind: 'statement',
    id: '33333333-3333-4333-8333-333333333333',
    title: 'STMT-2026-0903',
    subtitle: 'Cebu Build Co · Aug 01, 2026 to Aug 31, 2026 · sent',
    status: 'sent',
    to: '/business-accounts/11111111-1111-4111-8111-111111111111?tab=invoices&invoiceId=33333333-3333-4333-8333-333333333333',
  }]);
  expect(JSON.stringify(results)).not.toContain('BANK-PRIVATE-REFERENCE-394');
  expect(queryMock).toHaveBeenCalledTimes(12);
  const statementQuery = queryMock.mock.calls.find(([sql]) => (
    typeof sql === 'string' && sql.includes('FROM business_invoices bi')
  ));
  expect(statementQuery?.[0]).toMatch(/business_invoice_payments payment/);
  expect(statementQuery?.[0]).toMatch(/payment\.external_reference/);
});
