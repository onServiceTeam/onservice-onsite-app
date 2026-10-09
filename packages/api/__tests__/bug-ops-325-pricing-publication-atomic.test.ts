import { createHash } from 'crypto';

const queryMock = jest.fn();
const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { publishPricingRuleDraft } from '../src/services/pricing-publication.service';

it('Bug OPS-325 — publication consumes the operator’s current preview and writes the activation and audit atomically', async () => {
  const ruleId = '00000000-0000-4000-8000-000000000325';
  const previewId = '00000000-0000-4000-8000-000000000326';
  const actorId = '00000000-0000-4000-8000-000000000001';
  const updatedAt = new Date('2026-09-02T01:00:00.000Z');
  const activeState: unknown[] = [];
  const fingerprint = createHash('sha256').update(JSON.stringify(activeState)).digest('hex');
  const calls: string[] = [];

  queryMock.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue);
    calls.push(sql);
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('SELECT * FROM pricing_rules WHERE id = $1 FOR UPDATE')) {
      return { rows: [{ id: ruleId, publication_status: 'draft', updated_at: updatedAt }], rowCount: 1 };
    }
    if (sql.includes('FROM pricing_rule_previews')) {
      return { rows: [{
        id: previewId,
        pricing_rule_id: ruleId,
        created_by: actorId,
        rule_updated_at: updatedAt,
        resolver_fingerprint: fingerprint,
        sample_results: [{ winningRule: { id: ruleId, isDraft: true } }],
        expires_at: new Date(Date.now() + 60_000),
        created_at: updatedAt,
      }], rowCount: 1 };
    }
    if (sql.includes('SELECT id, updated_at, publication_status, is_active')) {
      return { rows: activeState, rowCount: 0 };
    }
    if (sql.includes('UPDATE pricing_rules')) {
      return { rows: [{ id: ruleId, publication_status: 'published', is_active: true }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO admin_actions')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({ query: queryMock }));

  const result = await publishPricingRuleDraft(ruleId, {
    previewId,
    reason: 'Publishing after reviewing the authoritative customer-price preview.',
  }, actorId);

  expect(result).toMatchObject({ publication_status: 'published', is_active: true });
  expect(calls.findIndex((sql) => sql.includes('pg_advisory_xact_lock'))).toBeLessThan(
    calls.findIndex((sql) => sql.includes('UPDATE pricing_rules')),
  );
  expect(calls.some((sql) => sql.includes('INSERT INTO admin_actions'))).toBe(true);
  expect(transactionMock).toHaveBeenCalledTimes(1);
});
