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

import { previewAccountLifecycle } from '../src/services/business-control.service';

it('Bug OPS-336 — account lifecycle impact excludes fully paid-out and cancelled work from the open-booking count', async () => {
  const accountId = '00000000-0000-4000-8000-000000000336';
  const actorId = '00000000-0000-4000-8000-000000000001';
  const calls: string[] = [];

  queryMock.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue);
    calls.push(sql);
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('FROM business_accounts') && sql.includes('FOR UPDATE')) {
      return { rows: [{
        id: accountId,
        company_name: 'Lifecycle Scope Co',
        owner_user_id: 'owner-1',
        status: 'active',
        payment_terms: 'net_30',
        volume_discount_rate: '0.00',
        monthly_credit_limit: 5_000_000,
        record_version: 4,
        updated_at: new Date('2026-09-02T00:00:00.000Z'),
      }], rowCount: 1 };
    }
    if (sql.includes('published_contract_count')) {
      return { rows: [{
        published_contract_count: '2',
        open_booking_count: '3',
        future_booking_count: '1',
        controlled_statement_count: '4',
        open_statement_count: '1',
      }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO business_account_lifecycle_previews')) {
      return { rows: [{
        id: 'preview-336',
        expires_at: new Date('2026-09-02T00:30:00.000Z'),
        created_at: new Date('2026-09-02T00:00:00.000Z'),
      }], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({ query: queryMock }));

  const preview = await previewAccountLifecycle(accountId, 'suspend', actorId);

  const impactQuery = calls.find((sql) => sql.includes('published_contract_count'))!;
  expect(impactQuery).toContain("'paid_out'");
  expect(impactQuery).toContain("'cancelled_by_customer'");
  expect(preview.impact).toMatchObject({
    openBookingCount: 3,
    futureBookingCount: 1,
    openStatementCount: 1,
  });
});
