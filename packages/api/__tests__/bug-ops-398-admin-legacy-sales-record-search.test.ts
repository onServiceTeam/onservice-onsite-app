jest.mock('../src/models/db', () => ({ db: { query: jest.fn() } }));

import { db } from '../src/models/db';
import { searchAdminRecords } from '../src/services/admin-search.service';

const queryMock = db.query as jest.Mock;

it('Bug OPS-398 - global operator search labels and opens an exact retained legacy sales record without implying current tax authority', async () => {
  queryMock.mockImplementation(async (sql: string) => ({
    rows: sql.includes('FROM official_receipts o') ? [{
      id: '39800000-0000-4000-8000-000000000398',
      title: 'OR-2026-09-000398',
      context: 'Booking 39800000 · Legacy Customer · Legacy Provider',
      status: 'retained for review',
      phone: null,
      email: null,
      related_id: '39800000-0000-4000-8000-000000003980',
      rank: 0,
      created_at: new Date('2026-09-03T04:00:00.000Z'),
    }] : [],
  }));

  const results = await searchAdminRecords('OR-2026-09-000398');

  expect(results).toEqual([{
    kind: 'legacy_sales_record',
    id: '39800000-0000-4000-8000-000000000398',
    title: 'Legacy record OR-2026-09-000398',
    subtitle: 'Booking 39800000 · Legacy Customer · Legacy Provider · retained for review',
    status: 'retained for review',
    to: '/financials?tab=receipts&receiptOr=OR-2026-09-000398',
  }]);
  expect(JSON.stringify(results)).not.toContain('Official Receipt');
  expect(JSON.stringify(results)).not.toContain('BIR compliant');
  expect(queryMock).toHaveBeenCalledTimes(12);
  const legacyQuery = queryMock.mock.calls.find(([sql]) => (
    typeof sql === 'string' && sql.includes('FROM official_receipts o')
  ));
  expect(legacyQuery?.[0]).toMatch(/o\.or_number/);
  expect(legacyQuery?.[0]).toMatch(/retained for review/);
  expect(legacyQuery?.[1]).toEqual(['OR-2026-09-000398', '202609000398', 4]);
});
