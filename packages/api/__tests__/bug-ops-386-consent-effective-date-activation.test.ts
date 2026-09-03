const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { getPendingMaterialConsents } from '../src/services/compliance.service';

it('Bug OPS-386 — material re-consent activates on its effective date with legacy-safe fallbacks', async () => {
  const publishedAt = new Date('2026-09-03T01:00:00.000Z');
  const databaseNow = new Date('2026-09-03T04:00:00.000Z');
  const common = {
    change_summary: 'Approved material policy change.',
    published_at: publishedAt,
    database_now: databaseNow,
    user_current_version: 'v1',
    user_last_action_at: new Date('2026-08-01T00:00:00.000Z'),
    user_granted: true,
  };
  dbQueryMock.mockResolvedValueOnce({
    rows: [
      {
        ...common,
        consent_type: 'privacy_policy',
        latest_version: 'v2',
        effective_at: databaseNow,
      },
      {
        ...common,
        consent_type: 'terms_of_service',
        latest_version: 'v3',
        effective_at: new Date('2026-09-04T00:00:00.000Z'),
      },
      {
        ...common,
        consent_type: 'marketing_consent',
        latest_version: 'v4',
        effective_at: null,
      },
      {
        ...common,
        consent_type: 'data_sharing_partners',
        latest_version: 'v5',
        effective_at: 'not-a-timestamp',
      },
    ],
    rowCount: 4,
  });

  const pending = await getPendingMaterialConsents(
    '11111111-1111-4111-8111-111111111111',
  );

  expect(pending.map((record) => record.consentType)).toEqual([
    'privacy_policy',
    'marketing_consent',
    'data_sharing_partners',
  ]);
  expect(pending[0]?.effectiveAt).toBe(databaseNow.toISOString());
  expect(pending[1]?.effectiveAt).toBe(publishedAt.toISOString());
  expect(pending[2]?.effectiveAt).toBe(publishedAt.toISOString());

  const sql = dbQueryMock.mock.calls[0]?.[0] as string;
  expect(sql).toMatch(/NULLIF\(BTRIM\(details->>'effectiveAt'\), ''\) IS NULL THEN created_at/);
  expect(sql).toMatch(/pg_input_is_valid\(details->>'effectiveAt', 'timestamp with time zone'\)/);
  expect(sql).toMatch(/ELSE created_at/);
  expect(sql).toMatch(/WHERE effective_at <= NOW\(\)/);
  expect(sql).toMatch(/ORDER BY consent_type, published_at DESC, id DESC/);
});
