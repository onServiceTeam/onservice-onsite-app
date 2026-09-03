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

import { previewBusinessTerms } from '../src/services/business-control.service';

it('Bug OPS-350 — immediate business terms use the database clock instead of a web-server timestamp', async () => {
  const accountId = '00000000-0000-4000-8000-000000000350';
  let insertSql = '';
  let insertParams: unknown[] = [];

  queryMock.mockImplementation(async (sqlValue: unknown, params: unknown[] = []) => {
    const sql = String(sqlValue);
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('FROM business_accounts') && sql.includes('FOR UPDATE')) {
      return { rows: [{
        id: accountId,
        company_name: 'Clock Co',
        owner_user_id: '00000000-0000-4000-8000-000000000001',
        status: 'active',
        payment_terms: 'net_30',
        volume_discount_rate: '0.00',
        monthly_credit_limit: '1000000',
        record_version: 3,
        updated_at: new Date('2026-09-02T00:00:00.000Z'),
      }], rowCount: 1 };
    }
    if (sql.includes('FROM business_account_term_versions')) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('published_contract_count')) {
      return { rows: [{
        published_contract_count: '0', open_booking_count: '0', future_booking_count: '0',
        controlled_statement_count: '0', open_statement_count: '0',
      }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO business_account_term_previews')) {
      insertSql = sql;
      insertParams = params;
      return { rows: [{
        id: '00000000-0000-4000-8000-000000000351',
        payment_terms: 'net_15',
        volume_discount_basis_points: 250,
        monthly_credit_limit: '2000000',
        effective_from: new Date('2026-09-02T05:00:00.000Z'),
        expires_at: new Date('2026-09-02T05:30:00.000Z'),
        created_at: new Date('2026-09-02T05:00:00.000Z'),
      }], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({ query: queryMock }));

  const preview = await previewBusinessTerms(accountId, {
    expectedVersion: 3,
    paymentTerms: 'net_15',
    volumeDiscountRate: 2.5,
    monthlyCreditLimit: 2_000_000,
  }, '00000000-0000-4000-8000-000000000001');

  expect(insertSql).toContain('NOW()');
  expect(insertSql).toContain('effective_from');
  expect(insertParams).toHaveLength(8);
  expect(insertParams).not.toContain('2026-09-02T05:00:00.000Z');
  expect(preview.proposedTerms.effectiveFrom).toEqual(new Date('2026-09-02T05:00:00.000Z'));
});
