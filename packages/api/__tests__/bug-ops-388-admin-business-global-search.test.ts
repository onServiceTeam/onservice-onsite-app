jest.mock('../src/models/db', () => ({ db: { query: jest.fn() } }));

import { db } from '../src/models/db';
import { searchAdminRecords } from '../src/services/admin-search.service';

const queryMock = db.query as jest.Mock;

it('Bug OPS-388 - global operator search finds Business Account 360 without returning raw contact or tax details', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Cebu Build Co',
      context: 'Cebu City, Cebu · Contact Andrea Reyes',
      status: 'active',
      phone: '+639171234567',
      email: 'accounts@cebubuild.example',
      related_id: '22222222-2222-4222-8222-222222222222',
      rank: 1,
      created_at: new Date('2026-09-03T00:00:00.000Z'),
    }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });

  const results = await searchAdminRecords('Cebu Build Co');

  expect(results).toEqual([expect.objectContaining({
    kind: 'business',
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Cebu Build Co',
    status: 'active',
    to: '/business-accounts/11111111-1111-4111-8111-111111111111',
  })]);
  expect(results[0]?.subtitle).toContain('Cebu City, Cebu · Contact Andrea Reyes · active');
  expect(results[0]?.subtitle).toContain('+63 9XX XXX 4567');
  expect(results[0]?.subtitle).toContain('a•••@cebubuild.example');
  expect(JSON.stringify(results)).not.toContain('+639171234567');
  expect(JSON.stringify(results)).not.toContain('accounts@cebubuild.example');
  expect(JSON.stringify(results)).not.toContain('registration');
  expect(JSON.stringify(results)).not.toContain('tax');
  expect(queryMock).toHaveBeenCalledTimes(9);
  const businessQuery = queryMock.mock.calls.find(([sql]) => (
    typeof sql === 'string' && sql.includes('FROM business_accounts ba')
  ));
  expect(businessQuery?.[0]).toMatch(/ba\.registration_number/);
  expect(businessQuery?.[0]).toMatch(/ba\.tax_id/);
  expect(businessQuery?.[1]).toEqual(['Cebu Build Co', '', 4]);
});
