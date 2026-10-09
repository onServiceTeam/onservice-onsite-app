const dbQuery = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQuery(...args) },
}));
jest.mock('../src/services/notification.service', () => ({}));

import { listPublishedConsentVersions } from '../src/services/compliance-admin.service';

it('Bug OPS-474 - published consent history returns the responsible admin identity with the audit ID', async () => {
  dbQuery.mockResolvedValueOnce({
    rows: [{
      id: 'publication-event-1',
      target_id: 'publication-target-1',
      admin_id: 'admin-1',
      admin_name: 'Ava Santos',
      admin_email: 'ava@onservice.test',
      details: {
        consentType: 'privacy_policy',
        version: 'v4',
        effectiveAt: '2026-09-04T00:00:00.000Z',
        changeSummary: 'Approved the updated privacy processing explanation for customers.',
        material: false,
      },
      created_at: new Date('2026-09-03T00:00:00.000Z'),
    }],
  });

  const result = await listPublishedConsentVersions({});
  const sql = dbQuery.mock.calls[0]?.[0] as string;

  expect(sql).toMatch(/LEFT JOIN users u ON u\.id = a\.admin_id/);
  expect(sql).toMatch(/first_name/);
  expect(sql).toMatch(/u\.email AS admin_email/);
  expect(result[0]).toMatchObject({
    publishedBy: 'admin-1',
    publishedByName: 'Ava Santos',
    publishedByEmail: 'ava@onservice.test',
  });
});
