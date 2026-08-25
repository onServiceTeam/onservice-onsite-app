const dbTransactionMock = jest.fn();

jest.mock('../../src/models/db', () => ({
  db: {
    query: jest.fn(),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { updateStaffMember } from '../../src/services/staff.service';

describe('Staff directory profile update audit', () => {
  it('Bug UX-343 — a role-profile change records actor, reason, and before/after metadata in the same transaction', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({
        rows: [{
          id: 'staff-1', user_id: 'admin-2', role_id: 'role-old', role_name: 'support_agent',
          is_active: true, last_login_at: null, created_at: new Date(), updated_at: new Date(),
        }],
      })
      .mockResolvedValueOnce({ rows: [{ name: 'finance' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'staff-1', user_id: 'admin-2', role_id: 'role-new', is_active: true,
          last_login_at: null, created_at: new Date(), updated_at: new Date(),
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    dbTransactionMock.mockImplementationOnce(async (cb: (client: { query: typeof query }) => unknown) => cb({ query }));

    await updateStaffMember(
      'staff-1',
      { roleId: 'role-new' },
      'super-1',
      'Move this profile to the finance operating queue.',
    );

    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    const audit = query.mock.calls.find(([sql]) => /INSERT INTO admin_actions/.test(sql as string));
    expect(audit).toBeDefined();
    expect(audit![0]).toMatch(/'config_changed'/);
    const params = audit![1] as unknown[];
    expect(params[0]).toBe('super-1');
    expect(params[3]).toBe('Move this profile to the finance operating queue.');
    expect(JSON.parse(params[2] as string)).toMatchObject({
      changeKind: 'staff_directory_profile_updated',
      previousRole: 'support_agent',
      newRole: 'finance',
    });
  });
});
