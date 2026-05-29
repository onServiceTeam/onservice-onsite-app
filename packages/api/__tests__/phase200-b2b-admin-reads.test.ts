// Phase 200 — admin B2B read variants skip the owner membership gate.
//
// The owner-facing getters (getBusinessAccount/getMembers/getContracts and
// invoice getInvoices) all first SELECT from business_members to confirm the
// caller is a member. The admin variants must NOT do that (back-office staff
// are not members; route-level requireAdmin enforces access). These tests
// assert the admin variants run only their data query and return the rows.

const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...a: unknown[]) => dbQueryMock(...a) } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getBusinessAccountAdmin, getMembersAdmin, getContractsAdmin } from '../src/services/business.service';
import { getInvoicesAdmin } from '../src/services/invoice.service';

beforeEach(() => { dbQueryMock.mockReset(); });

function sqlOf(callIndex: number): string {
  return String(dbQueryMock.mock.calls[callIndex]?.[0] ?? '');
}

describe('Phase 200 — admin B2B read variants skip the membership gate', () => {
  it('getBusinessAccountAdmin runs only the accounts SELECT (no business_members precheck)', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [{ id: 'ba-1', company_name: 'Acme' }], rowCount: 1 });
    const row = await getBusinessAccountAdmin('ba-1');
    expect(row.id).toBe('ba-1');
    expect(dbQueryMock).toHaveBeenCalledTimes(1);
    expect(sqlOf(0)).toMatch(/FROM business_accounts/);
    expect(sqlOf(0)).not.toMatch(/business_members/);
  });

  it('getBusinessAccountAdmin throws 404 when the account does not exist', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(getBusinessAccountAdmin('missing')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('getMembersAdmin runs only the members JOIN query (no membership precheck)', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [{ id: 'm-1', user_id: 'u-1', role: 'owner' }], rowCount: 1 });
    const members = await getMembersAdmin('ba-1');
    expect(members).toHaveLength(1);
    expect(dbQueryMock).toHaveBeenCalledTimes(1);
    expect(sqlOf(0)).toMatch(/INNER JOIN users/);
  });

  it('getContractsAdmin runs data + count only (2 queries, no precheck)', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [{ id: 'c-1' }], rowCount: 1 }); // data
    dbQueryMock.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 }); // count
    const { items, total } = await getContractsAdmin('ba-1', 1, 20);
    expect(items).toHaveLength(1);
    expect(total).toBe(1);
    expect(dbQueryMock).toHaveBeenCalledTimes(2);
    expect(sqlOf(0)).toMatch(/FROM business_contracts/);
    expect(sqlOf(0)).not.toMatch(/business_members/);
  });

  it('getInvoicesAdmin runs data + count only (no permission precheck)', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [{ id: 'inv-1' }], rowCount: 1 }); // data
    dbQueryMock.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 }); // count
    const { items, total } = await getInvoicesAdmin('ba-1', 1, 20);
    expect(items).toHaveLength(1);
    expect(total).toBe(1);
    expect(dbQueryMock).toHaveBeenCalledTimes(2);
    expect(sqlOf(0)).toMatch(/FROM business_invoices/);
    expect(sqlOf(0)).not.toMatch(/can_view_invoices/);
  });
});
