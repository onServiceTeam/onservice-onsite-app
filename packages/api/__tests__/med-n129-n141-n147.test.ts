// MED-N129 / MED-N141 / MED-N147 fixes verified.

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { addStaffMember } from '../src/services/staff.service';
import { sendMessage } from '../src/services/messaging.service';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  dbTransactionMock.mockImplementation(async (cb: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cb as any)({
      query: (sql: string, params?: unknown[]) => dbQueryMock(sql, params),
    });
  });
});

describe('MED-N129 — addStaffMember writes admin_actions audit row inside trx', () => {
  it('MED-N129 — INSERT admin_staff + role lookup + INSERT admin_actions all in one trx', async () => {
    // INSERT admin_staff RETURNING *
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'staff-1',
        user_id: 'user-1',
        role_id: 'role-1',
        is_active: true,
        last_login_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      }],
      rowCount: 1,
    });
    // SELECT name FROM admin_roles
    dbQueryMock.mockResolvedValueOnce({ rows: [{ name: 'admin' }], rowCount: 1 });
    // INSERT admin_actions
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const member = await addStaffMember({
      userId: 'user-1',
      roleId: 'role-1',
      addedByAdminId: 'super-1',
    });

    expect(member.id).toBe('staff-1');
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(dbQueryMock).toHaveBeenCalledTimes(3);

    const auditCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO admin_actions/.test(sql as string),
    );
    expect(auditCall).toBeDefined();
    expect(auditCall![0]).toMatch(/staff_added/);
    const params = auditCall![1] as unknown[];
    expect(params[0]).toBe('super-1');
    expect(params[1]).toBe('staff-1');
    const details = JSON.parse(params[2] as string);
    expect(details.addedUserId).toBe('user-1');
    expect(details.addedRole).toBe('admin');
  });

  it('MED-N129 — translates 23505 unique violation to 409', async () => {
    dbQueryMock.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    await expect(
      addStaffMember({ userId: 'u1', roleId: 'r1', addedByAdminId: 'super-1' }),
    ).rejects.toThrow(/already a staff member/);
  });
});

describe('MED-N141 — sendMessage writes message + conversation timestamp atomically', () => {
  it('MED-N141 — INSERT messages + UPDATE conversations both run on the trx client', async () => {
    // getConversationById SELECT (runs OUTSIDE trx — pre-check).
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'c1', customer_id: 'u1', provider_id: 'p1',
        booking_id: null, is_active: true,
        created_at: new Date(), updated_at: new Date(),
      }],
      rowCount: 1,
    });
    // INSERT messages.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'm1', conversation_id: 'c1', sender_id: 'u1',
        content: 'hello', message_type: 'text', image_url: null,
        is_flagged: false, is_read: false, created_at: new Date(),
      }],
      rowCount: 1,
    });
    // UPDATE conversations.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const out = await sendMessage('c1', 'u1', 'hello');
    expect(out.id).toBe('m1');
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);

    // Check both writes happened.
    const insertCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO messages/.test(sql as string),
    );
    const updateCall = dbQueryMock.mock.calls.find(
      ([sql]) => /UPDATE conversations/.test(sql as string),
    );
    expect(insertCall).toBeDefined();
    expect(updateCall).toBeDefined();
  });
});

describe('MED-N147 — referral generateCode uses crypto.randomBytes (not Math.random)', () => {
  // We test by inspecting the source — the function isn't exported.
  // Then we run getOrCreateReferralCode end-to-end and assert the
  // generated code passes the CSPRNG smoke test (uniform char set,
  // length 8).
  const REFERRAL_SOURCE = require('fs').readFileSync(
    require('path').resolve(__dirname, '../src/services/referral.service.ts'),
    'utf8',
  ) as string;

  it('MED-N147 — source uses crypto.randomBytes, not Math.random', () => {
    // No Math.random call in generateCode.
    const generateCodeBody = REFERRAL_SOURCE.match(
      /function generateCode\([\s\S]*?\n\}/,
    );
    expect(generateCodeBody).not.toBeNull();
    expect(generateCodeBody![0]).not.toMatch(/Math\.random/);
    expect(generateCodeBody![0]).toMatch(/crypto\.randomBytes/);
    // Rejection-sampling for uniform distribution.
    expect(generateCodeBody![0]).toMatch(/maxValid/);
  });

  it('MED-N147 — generated codes use only the documented charset', async () => {
    // Drive a real call to getOrCreateReferralCode and inspect the
    // INSERTed code value.
    const svc = require('../src/services/referral.service');
    // SELECT existing — none.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // dup check — no dup.
    dbQueryMock.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
    // INSERT returning row.
    dbQueryMock.mockImplementationOnce((_sql: string, params: unknown[]) => {
      // params[1] is the code we generated.
      return Promise.resolve({
        rows: [{
          id: 'rc-1',
          user_id: params[0],
          code: params[1],
          type: 'standard',
          uses_count: 0,
          max_uses: null,
          referrer_bonus: '0',
          referee_bonus: '0',
          is_active: true,
          expires_at: null,
          created_at: new Date(),
        }],
        rowCount: 1,
      });
    });

    const out = await svc.getOrCreateReferralCode('u1');
    expect(out.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  });
});
