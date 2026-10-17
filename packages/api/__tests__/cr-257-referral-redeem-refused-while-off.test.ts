// CR-257 (customer review 2026-10-17, slice P2, discovery-support-1; D41 Q32
// option a): referral off switch. While referral_program_enabled is off (its
// default from migration 188), redeeming a valid referral code is refused
// with a plain message, and no wallet, ledger, redemption, code counter or
// notification row changes. Real referral router, real authentication
// middleware, real SQL on the guarded PostgreSQL fixture.
import {
  customerUser, p2Http, p2It as it, referrerUser, walletSnapshot, withP2Database,
} from './helpers/p2-switches-postgres';
import referralRouter from '../src/routes/referral.routes';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug CR-257 — while referral bonuses are off, redeeming a valid code is refused and no wallet changes', async () => {
  await withP2Database(async database => {
    await database.query(`INSERT INTO wallets (user_id, type, available_balance) VALUES
        ($1, 'customer', 12500), ($2, 'customer', 0)`, [customerUser, referrerUser]);
    await database.query(`INSERT INTO referral_codes (user_id, code, referrer_bonus, referee_bonus)
        VALUES ($1, 'JUANREF8', 5000, 5000)`, [referrerUser]);
    const before = {
      wallets: await walletSnapshot(database, [customerUser, referrerUser]),
      codes: (await database.query('SELECT code, uses_count FROM referral_codes')).rows,
    };

    const http = p2Http([['/api/v1/referrals', referralRouter]]);
    const response = await http.post('/api/v1/referrals/redeem', { code: 'JUANREF8' }, { userId: customerUser, role: 'customer' });

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      message: 'Referral bonuses are not available right now.',
      statusCode: 409,
      code: 'referral_program_off',
    });
    expect({
      wallets: await walletSnapshot(database, [customerUser, referrerUser]),
      codes: (await database.query('SELECT code, uses_count FROM referral_codes')).rows,
    }).toEqual(before);
    const written = (await database.query(`SELECT
        (SELECT COUNT(*)::int FROM referral_redemptions) AS redemptions,
        (SELECT COUNT(*)::int FROM notifications) AS notifications,
        (SELECT COUNT(*)::int FROM wallet_transactions) AS ledger`)).rows[0];
    expect(written).toEqual({ redemptions: 0, notifications: 0, ledger: 0 });
  });
}, 90000);
