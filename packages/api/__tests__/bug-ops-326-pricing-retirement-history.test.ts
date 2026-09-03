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

import { retirePricingRule } from '../src/services/pricing-publication.service';

it('Bug OPS-326 — retirement deactivates and audits a rule without deleting its history or changing booking evidence', async () => {
  const ruleId = '00000000-0000-4000-8000-000000000326';
  const calls: string[] = [];
  queryMock.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue);
    calls.push(sql);
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('SELECT * FROM pricing_rules WHERE id = $1 FOR UPDATE')) {
      return { rows: [{ id: ruleId, publication_status: 'published', is_active: true }], rowCount: 1 };
    }
    if (sql.includes('UPDATE pricing_rules')) {
      return { rows: [{ id: ruleId, publication_status: 'retired', is_active: false }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO admin_actions')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({ query: queryMock }));

  const result = await retirePricingRule(ruleId, {
    reason: 'Retiring this rule prospectively after operations review.',
  }, '00000000-0000-4000-8000-000000000001');

  expect(result).toMatchObject({ publication_status: 'retired', is_active: false });
  expect(calls.some((sql) => /DELETE\s+FROM\s+pricing_rules/i.test(sql))).toBe(false);
  expect(calls.some((sql) => sql.includes('UPDATE bookings'))).toBe(false);
  expect(calls.some((sql) => sql.includes('UPDATE booking_financial_terms'))).toBe(false);
  expect(calls.some((sql) => sql.includes('INSERT INTO admin_actions'))).toBe(true);
});
