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

it('Bug SEC-025 — a stale pricing preview cannot activate a customer-price change', async () => {
  const updatedAt = new Date('2026-09-02T01:00:00.000Z');
  queryMock.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue);
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('SELECT * FROM pricing_rules WHERE id = $1 FOR UPDATE')) {
      return { rows: [{ id: 'rule-1', publication_status: 'draft', updated_at: updatedAt }], rowCount: 1 };
    }
    if (sql.includes('FROM pricing_rule_previews')) {
      return { rows: [{
        id: 'preview-1',
        rule_updated_at: updatedAt,
        resolver_fingerprint: 'fingerprint-before-another-rule-changed',
        expires_at: new Date(Date.now() + 60_000),
      }], rowCount: 1 };
    }
    if (sql.includes('SELECT id, updated_at, publication_status, is_active')) {
      return { rows: [{ id: 'another-rule', updated_at: new Date(), publication_status: 'published', is_active: true }], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({ query: queryMock }));

  await expect(publishPricingRuleDraft('rule-1', {
    previewId: 'preview-1',
    reason: 'Attempting publication from a stale pricing preview.',
  }, 'actor-1')).rejects.toMatchObject({ statusCode: 409 });

  expect(queryMock.mock.calls.some((call) => String(call[0]).includes('UPDATE pricing_rules'))).toBe(false);
  expect(queryMock.mock.calls.some((call) => String(call[0]).includes('INSERT INTO admin_actions'))).toBe(false);
});
