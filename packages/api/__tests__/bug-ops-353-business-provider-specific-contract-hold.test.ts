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

import { previewContractLifecycle } from '../src/services/business-control.service';

it('Bug OPS-353 — a provider-specific contract cannot publish before assignment and payable semantics are approved', async () => {
  const accountId = '00000000-0000-4000-8000-000000000353';
  const contractId = '00000000-0000-4000-8000-000000000354';
  queryMock.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue);
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('FROM business_accounts')) {
      return { rows: [{
        id: accountId, company_name: 'Provider Contract Co', owner_user_id: 'owner-1',
        status: 'active', payment_terms: 'net_30', volume_discount_rate: '0.00',
        monthly_credit_limit: '5000000', record_version: 2,
        updated_at: new Date('2026-09-02T00:00:00.000Z'),
      }], rowCount: 1 };
    }
    if (sql.includes('FROM business_contracts')) {
      return { rows: [{
        id: contractId, business_account_id: accountId,
        category_id: '00000000-0000-4000-8000-000000000355', subcategory_id: null,
        provider_id: '00000000-0000-4000-8000-000000000356',
        contract_type: 'on_demand', frequency: null,
        agreed_rate: '100000', discount_percentage: '0.00',
        estimated_monthly_value: '1000000', start_date: '2026-09-01', end_date: null,
        auto_renew: false, status: 'draft', terms: null, record_version: 1,
        published_at: null, updated_at: new Date('2026-09-02T00:00:00.000Z'),
      }], rowCount: 1 };
    }
    if (sql.includes('FROM business_account_term_versions')) {
      return { rows: [{
        id: 'terms-353', business_account_id: accountId, version: 1,
        payment_terms: 'net_30', volume_discount_basis_points: 0,
        monthly_credit_limit: '5000000', currency: 'PHP',
        effective_from: new Date('2026-09-01T00:00:00.000Z'),
      }], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({ query: queryMock }));

  await expect(previewContractLifecycle(
    accountId,
    contractId,
    'publish',
    '00000000-0000-4000-8000-000000000001',
  )).rejects.toMatchObject({ statusCode: 409 });

  expect(queryMock.mock.calls.some((call) => String(call[0]).includes('business_contract_publication_previews'))).toBe(false);
});
