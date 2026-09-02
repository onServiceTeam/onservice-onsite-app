jest.mock('../src/models/db', () => ({ db: { query: jest.fn() } }));

import { db } from '../src/models/db';
import { searchAdminRecords } from '../src/services/admin-search.service';

const queryMock = db.query as jest.Mock;

it('Bug OPS-393 - global operator search opens the exact contract inside its owning Business Account 360', async () => {
  queryMock.mockImplementation(async (sql: string) => ({
    rows: sql.includes('FROM business_contracts bc') ? [{
      id: '22222222-2222-4222-8222-222222222222',
      title: 'Post-construction cleaning',
      context: 'Cebu Build Co · Post-construction cleaning · Open provider pool',
      status: 'draft',
      phone: null,
      email: null,
      related_id: '11111111-1111-4111-8111-111111111111',
      rank: 0,
      created_at: new Date('2026-09-03T01:00:00.000Z'),
    }] : [],
  }));

  const results = await searchAdminRecords('22222222');

  expect(results).toEqual([{
    kind: 'contract',
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Contract 22222222',
    subtitle: 'Cebu Build Co · Post-construction cleaning · Open provider pool · draft',
    status: 'draft',
    to: '/business-accounts/11111111-1111-4111-8111-111111111111?tab=contracts&contractId=22222222-2222-4222-8222-222222222222',
  }]);
  expect(queryMock).toHaveBeenCalledTimes(10);
  const contractQuery = queryMock.mock.calls.find(([sql]) => (
    typeof sql === 'string' && sql.includes('FROM business_contracts bc')
  ));
  expect(contractQuery?.[0]).toMatch(/JOIN business_accounts ba ON ba\.id = bc\.business_account_id/);
  expect(contractQuery?.[0]).toMatch(/STRPOS\(LOWER\(ba\.company_name\)/);
});
