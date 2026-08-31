const dbQuery = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQuery(...args) },
}));
jest.mock('../src/services/notification.service', () => ({}));

import { listConsentVersions } from '../src/services/compliance-admin.service';

it('Bug UX-807 — consent version counts derive current grants from each user’s latest decision', async () => {
  dbQuery.mockResolvedValue({
    rows: [{
      consent_type: 'privacy_policy',
      version: '2.0',
      total_records: '8',
      active_users: '3',
      earliest_granted: new Date('2026-08-01T00:00:00.000Z'),
      latest_granted: new Date('2026-08-31T00:00:00.000Z'),
    }],
  });

  const result = await listConsentVersions();
  const sql = dbQuery.mock.calls[0][0] as string;

  expect(sql).toMatch(/DISTINCT ON \(user_id, consent_type\)/);
  expect(sql).toMatch(/ORDER BY user_id, consent_type, granted_at DESC, id DESC/);
  expect(result[0]).toMatchObject({ activeUsers: 3, totalRecords: 8 });
});
