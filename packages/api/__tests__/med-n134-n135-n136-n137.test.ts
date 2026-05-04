// MED-N134 / MED-N135 / MED-N136 / MED-N137 — slot-waitlist + support-ticket cluster.

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

import {
  joinSlotWaitlist,
} from '../src/services/slot-waitlist.service';
import {
  createTicket,
  addMessage,
  maskTicketForRole,
} from '../src/services/support-ticket.service';

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

describe('MED-N134 — joinSlotWaitlist dedup is race-safe (trx + FOR UPDATE)', () => {
  it('MED-N134 — opens db.transaction with SELECT FOR UPDATE', async () => {
    // BUG-PHASE78-01 test maintenance — Phase 29-01 changed the
    // existence check from `SELECT COUNT(*) ... FOR UPDATE` (which
    // Postgres rejects with "FOR UPDATE not allowed with aggregate
    // functions") to `SELECT id ... LIMIT 1 FOR UPDATE`. Mock now
    // returns empty rows (no existing waitlist row).
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // INSERT returns the new row.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'w1', customer_id: 'c1', category_id: 'cat1',
        preferred_date: '2099-06-01', status: 'waiting',
      }],
      rowCount: 1,
    });

    const out = await joinSlotWaitlist({
      customerId: 'c1',
      categoryId: 'cat1',
      preferredDate: '2099-06-01',
      preferredTimeStart: '09:00',
      preferredTimeEnd: '17:00',
      city: 'Boracay',
      province: 'Aklan',
    });

    expect(out.id).toBe('w1');
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    const selectCall = dbQueryMock.mock.calls[0]!;
    // BUG-PHASE78-01 — pre-fix expected COUNT(*); now LIMIT 1 FOR UPDATE.
    expect(selectCall[0]).toMatch(/SELECT id[\s\S]*?LIMIT 1 FOR UPDATE/);
  });

  it('MED-N134 — translates 23505 unique violation to 409 friendly error', async () => {
    // BUG-PHASE78-01 — existence check now LIMIT 1 (returns empty rows).
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    dbQueryMock.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));

    await expect(
      joinSlotWaitlist({
        customerId: 'c1',
        categoryId: 'cat1',
        preferredDate: '2099-06-01',
        preferredTimeStart: '09:00',
        preferredTimeEnd: '17:00',
        city: 'Boracay',
        province: 'Aklan',
      }),
    ).rejects.toThrow(/already on the waitlist/);
  });

  it('MED-N134 — refuses join when existing waiting row exists', async () => {
    // BUG-PHASE78-01 — existence check now SELECT id (returns the row id).
    dbQueryMock.mockResolvedValueOnce({ rows: [{ id: 'w-existing' }], rowCount: 1 });
    await expect(
      joinSlotWaitlist({
        customerId: 'c1',
        categoryId: 'cat1',
        preferredDate: '2099-06-01',
        preferredTimeStart: '09:00',
        preferredTimeEnd: '17:00',
        city: 'Boracay',
        province: 'Aklan',
      }),
    ).rejects.toThrow(/already on the waitlist/);
  });
});

describe('MED-N135 — createTicket writes admin_actions audit when admin acts on behalf of user', () => {
  it('MED-N135 — admin-acting-on-behalf-of-user writes audit row in trx', async () => {
    // generateTicketNumber probably calls db.query — we mock as returning a count.
    dbQueryMock.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 }); // ticket number generator
    // INSERT support_tickets
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 't1', ticket_number: 'TK-001', user_id: 'user-1', type: 'booking_issue', priority: 'medium' }],
      rowCount: 1,
    });
    // INSERT admin_actions
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const out = await createTicket({
      userId: 'user-1',
      type: 'booking_issue',
      priority: 'medium',
      subject: 'Refund request',
      description: 'Customer needs refund for booking',
      createdByAdminId: 'admin-1',
    });

    expect(out.id).toBe('t1');
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);

    const auditCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO admin_actions/.test(sql as string),
    );
    expect(auditCall).toBeDefined();
    expect(auditCall![0]).toMatch(/'config_changed'/);
    expect(auditCall![0]).toMatch(/'support_ticket'/);
    const params = auditCall![1] as unknown[];
    expect(params[0]).toBe('admin-1');
    expect(params[1]).toBe('t1');
    const details = JSON.parse(params[2] as string);
    expect(details.op).toBe('create_on_behalf_of_user');
    expect(details.forUserId).toBe('user-1');
  });

  it('MED-N135 — no audit row when user creates their own ticket (createdByAdminId === userId or omitted)', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 't1', ticket_number: 'TK-002', user_id: 'user-1', type: 'general_inquiry', priority: 'low' }],
      rowCount: 1,
    });

    await createTicket({
      userId: 'user-1',
      type: 'general_inquiry',
      priority: 'low',
      subject: 'Question',
      description: 'How does refund work',
    });

    const auditCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO admin_actions/.test(sql as string),
    );
    expect(auditCall).toBeUndefined();
  });
});

describe('MED-N136 — addMessage wraps INSERT + UPDATE in single trx', () => {
  it('MED-N136 — INSERT message + UPDATE ticket timestamp both run on the trx client', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'msg-1', ticket_id: 't1', sender_id: 'u1', sender_role: 'customer',
        message: 'hi', is_internal_note: false,
      }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE

    const out = await addMessage({
      ticketId: 't1', senderId: 'u1', senderRole: 'customer', message: 'hi',
    });
    expect(out.id).toBe('msg-1');
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);

    const updateCall = dbQueryMock.mock.calls.find(
      ([sql]) => /UPDATE support_tickets SET updated_at/.test(sql as string),
    );
    expect(updateCall).toBeDefined();
  });
});

describe('MED-N137 — maskTicketForRole role-aware PII masking', () => {
  const ticket = {
    id: 't1', ticket_number: 'TK-003', user_id: 'u1',
    user_phone: '+63 9171234567',
    user_email: 'jane.doe@example.com',
    user_first_name: 'Jane',
    user_last_name: 'Doe',
  };

  it('MED-N137 — super_admin sees raw values', () => {
    const out = maskTicketForRole(ticket, 'super_admin');
    expect(out.user_phone).toBe('+63 9171234567');
    expect(out.user_email).toBe('jane.doe@example.com');
    expect(out.user_last_name).toBe('Doe');
  });

  it('MED-N137 — dpo sees masked phone+email but full last_name', () => {
    const out = maskTicketForRole(ticket, 'dpo');
    expect(out.user_phone).not.toBe('+63 9171234567');
    expect(out.user_email).not.toBe('jane.doe@example.com');
    expect(out.user_last_name).toBe('Doe'); // DPO needs full identity for compliance
  });

  it('MED-N137 — support agent sees masked phone+email + last_initial only', () => {
    const out = maskTicketForRole(ticket, 'support');
    expect(out.user_phone).not.toBe('+63 9171234567');
    expect(out.user_email).not.toBe('jane.doe@example.com');
    expect(out.user_last_name).toBe('D.');
    expect(out.user_first_name).toBe('Jane'); // first name preserved for greeting
  });

  it('MED-N137 — null role still masks (defense in depth)', () => {
    const out = maskTicketForRole(ticket, null);
    // null falls into the "not super_admin" branch → masking applied.
    expect(out.user_phone).not.toBe('+63 9171234567');
  });
});
