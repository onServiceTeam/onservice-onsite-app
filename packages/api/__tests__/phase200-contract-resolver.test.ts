// Phase 200 — business.service.resolveBookingContract.
// Returns the active contract's agreed_rate (or null) for a booking placed
// for a business account, only when the customer is a member, the account +
// contract are active, the contract is within its dates, and the category
// matches. See .ai-coder/decisions/D-phase200-contract-pricing.md.

const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...a: unknown[]) => dbQueryMock(...a) } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { resolveBookingContract } from '../src/services/business.service';

beforeEach(() => { dbQueryMock.mockReset(); });

describe('Phase 200 — resolveBookingContract', () => {
  it('returns the agreed rate + contract id when a matching active contract exists', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'k-1', agreed_rate: 99900, account_terms_version_id: 'terms-1' }],
      rowCount: 1,
    });
    const r = await resolveBookingContract('cust-1', 'ba-1', 'cat-1', 'sub-1', '2026-04-15T08:00:00Z');
    expect(r).toEqual({ contractId: 'k-1', agreedRate: 99900, accountTermsVersionId: 'terms-1' });
  });

  it('guards on membership + active account/contract + date window', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await resolveBookingContract('cust-1', 'ba-1', 'cat-1', 'sub-1', '2026-04-15T08:00:00Z');
    const sql = String(dbQueryMock.mock.calls[0]![0]);
    expect(sql).toMatch(/JOIN business_members/);
    expect(sql).toMatch(/bm\.user_id = \$2 AND bm\.deleted_at IS NULL/);
    expect(sql).toMatch(/bm\.can_book = TRUE/);
    expect(sql).toMatch(/ba\.status = 'active'/);
    expect(sql).toMatch(/bc\.status = 'active'/);
    expect(sql).toMatch(/bc\.published_at IS NOT NULL/);
    expect(sql).toMatch(/business_account_term_versions/);
    expect(sql).toMatch(/bc\.category_id = \$3/);
    expect(sql).toMatch(/start_date <=/);
    expect(sql).toMatch(/end_date IS NULL OR/);
  });

  it('returns null when no contract matches', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect(await resolveBookingContract('cust-1', 'ba-1', 'cat-1', null, '2026-04-15T08:00:00Z')).toBeNull();
  });
});
