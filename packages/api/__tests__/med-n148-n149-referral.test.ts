// MED-N148 / MED-N149 — referral race-safe code creation + redemption.

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
jest.mock('../src/services/wallet.service', () => ({
  getUserWallet: jest.fn().mockResolvedValue({ id: 'w1' }),
}));

import { getOrCreateReferralCode, redeemReferralCode } from '../src/services/referral.service';

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

describe('MED-N148 — getOrCreateReferralCode uses INSERT ... ON CONFLICT (no SELECT-then-INSERT race)', () => {
  it('MED-N148 — first attempt succeeds; only SELECT existing + ONE INSERT', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // SELECT existing
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rc-1', user_id: 'u1', code: 'AAAA1111', type: 'standard',
        uses_count: 0, max_uses: null, referrer_bonus: '0',
        referee_bonus: '0', is_active: true, expires_at: null,
        created_at: new Date(),
      }],
      rowCount: 1,
    });

    const out = await getOrCreateReferralCode('u1');
    expect(out.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(dbQueryMock).toHaveBeenCalledTimes(2);
    const insertCall = dbQueryMock.mock.calls[1]!;
    expect(insertCall[0]).toMatch(/INSERT INTO referral_codes/);
    expect(insertCall[0]).toMatch(/ON CONFLICT \(code\) DO NOTHING/);
  });

  it('MED-N148 — collision: ON CONFLICT returns no rows; retries until success', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // SELECT existing
    // First attempt collides (no rows returned).
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // Second attempt succeeds.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rc-2', user_id: 'u1', code: 'BBBB2222', type: 'standard',
        uses_count: 0, max_uses: null, referrer_bonus: '0',
        referee_bonus: '0', is_active: true, expires_at: null,
        created_at: new Date(),
      }],
      rowCount: 1,
    });
    const out = await getOrCreateReferralCode('u1');
    expect(out.id).toBe('rc-2');
  });

  it('MED-N148 — gives up after 10 attempts with friendly 500', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    for (let i = 0; i < 10; i++) {
      dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    }
    await expect(getOrCreateReferralCode('u1')).rejects.toThrow(/Could not generate unique referral code/);
  });
});

describe('MED-N149 — redeemReferralCode runs all pre-checks inside trx with FOR UPDATE', () => {
  it('MED-N149 — SELECT FOR UPDATE on referral_codes + redemption insert + uses_count UPDATE all in trx', async () => {
    // SELECT referral_codes FOR UPDATE
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rc-1', user_id: 'referrer-1', code: 'AAAA1111',
        type: 'standard', uses_count: 0, max_uses: null,
        referrer_bonus: '100', referee_bonus: '50',
        is_active: true, expires_at: null,
        created_at: new Date(),
      }],
      rowCount: 1,
    });
    // existing redemption count = 0
    dbQueryMock.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
    // INSERT redemption
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'rd-1', referral_code_id: 'rc-1', referrer_id: 'referrer-1', referee_id: 'u2', referrer_bonus: '100', referee_bonus: '50', referee_credited: false }],
      rowCount: 1,
    });
    // UPDATE uses_count
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // UPDATE wallet
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // INSERT wallet_transactions
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // UPDATE referee_credited
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // INSERT notification
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const out = await redeemReferralCode('u2', 'aaaa1111');
    expect(out.id).toBe('rd-1');
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    const selectCall = dbQueryMock.mock.calls[0]!;
    expect(selectCall[0]).toMatch(/SELECT \* FROM referral_codes WHERE code = \$1 FOR UPDATE/);
  });

  it('MED-N149 — translates 23505 unique violation to friendly 409', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rc-1', user_id: 'referrer-1', code: 'AAAA1111',
        type: 'standard', uses_count: 0, max_uses: null,
        referrer_bonus: '100', referee_bonus: '50',
        is_active: true, expires_at: null,
        created_at: new Date(),
      }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
    dbQueryMock.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));

    await expect(redeemReferralCode('u2', 'aaaa1111')).rejects.toThrow(/already used a referral code/);
  });

  it('MED-N149 — refuses self-referral inside trx', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rc-1', user_id: 'u2', code: 'AAAA1111',
        type: 'standard', uses_count: 0, max_uses: null,
        referrer_bonus: '100', referee_bonus: '50',
        is_active: true, expires_at: null,
        created_at: new Date(),
      }],
      rowCount: 1,
    });
    await expect(redeemReferralCode('u2', 'aaaa1111')).rejects.toThrow(/cannot use your own referral/);
  });

  it('MED-N149 — refuses expired code', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rc-1', user_id: 'referrer-1', code: 'AAAA1111',
        type: 'standard', uses_count: 0, max_uses: null,
        referrer_bonus: '100', referee_bonus: '50',
        is_active: true, expires_at: new Date('2020-01-01'),
        created_at: new Date(),
      }],
      rowCount: 1,
    });
    await expect(redeemReferralCode('u2', 'aaaa1111')).rejects.toThrow(/expired/);
  });

  it('MED-N149 — refuses code at max_uses', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rc-1', user_id: 'referrer-1', code: 'AAAA1111',
        type: 'standard', uses_count: 5, max_uses: 5,
        referrer_bonus: '100', referee_bonus: '50',
        is_active: true, expires_at: null,
        created_at: new Date(),
      }],
      rowCount: 1,
    });
    await expect(redeemReferralCode('u2', 'aaaa1111')).rejects.toThrow(/maximum uses/);
  });
});
