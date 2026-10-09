const dbQuery = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQuery(...args) },
}));
jest.mock('../src/services/notification.service', () => ({}));

import { getPublishedConsentVersion } from '../src/services/compliance-admin.service';

it('Bug OPS-406 — exact consent publication lookup preserves target and audit-event identities', async () => {
  const targetId = '11111111-1111-1111-1111-111111111111';
  dbQuery.mockResolvedValue({
    rows: [{
      id: '22222222-2222-2222-2222-222222222222',
      target_id: targetId,
      admin_id: '33333333-3333-3333-3333-333333333333',
      details: {
        consentType: 'privacy_policy',
        version: '3.0',
        effectiveAt: '2026-09-10T00:00:00.000Z',
        changeSummary: 'Approved material changes to account-data processing purposes.',
        material: true,
      },
      created_at: new Date('2026-09-03T00:00:00.000Z'),
    }],
  });

  const result = await getPublishedConsentVersion(targetId);
  const [sql, params] = dbQuery.mock.calls[0] as [string, unknown[]];

  expect(sql).toMatch(/action_type = 'consent_version_published'/);
  expect(sql).toMatch(/target_type = 'consent_version'/);
  expect(sql).toMatch(/target_id = \$1/);
  expect(params).toEqual([targetId]);
  expect(result).toMatchObject({
    id: '22222222-2222-2222-2222-222222222222',
    targetId,
    consentType: 'privacy_policy',
    version: '3.0',
    material: true,
  });
});
