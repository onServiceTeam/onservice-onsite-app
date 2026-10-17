// CR-262 (customer review 2026-10-17, slice P2, discovery-support-2/3/14;
// D41 Q33 option a): Suki off switch. While suki_program_enabled is off (its
// default from migration 188), Suki Redeem is refused with a plain message,
// and the points balance, the customer's wallet and ledger, and the rewards
// history do not change. Real Suki router, real authentication middleware,
// real SQL on the guarded PostgreSQL fixture.
import {
  approvedProvider, customerUser, p2Http, p2It as it, walletSnapshot, withP2Database,
} from './helpers/p2-switches-postgres';
import sukiRouter from '../src/routes/suki.routes';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug CR-262 — while Suki is off, redeeming points is refused and no points or wallet money move', async () => {
  await withP2Database(async database => {
    await database.query(`INSERT INTO wallets (user_id, type, available_balance) VALUES ($1, 'customer', 20000)`, [customerUser]);
    const membership = (await database.query<{ id: string }>(`INSERT INTO suki_memberships
        (customer_id, provider_id, total_bookings, tier, points_balance) VALUES ($1, $2, 12, 'suki', 1000) RETURNING id`,
    [customerUser, approvedProvider])).rows[0]!.id;
    const before = await walletSnapshot(database, [customerUser]);

    const http = p2Http([['/api/v1/suki', sukiRouter]]);
    const response = await http.post('/api/v1/suki/redeem', { membershipId: membership, points: 1000 },
      { userId: customerUser, role: 'customer' });

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      message: 'Suki rewards are not available right now.',
      statusCode: 409,
      code: 'suki_program_off',
    });
    expect(await walletSnapshot(database, [customerUser])).toEqual(before);
    const state = (await database.query(`SELECT
        (SELECT points_balance FROM suki_memberships WHERE id = $1) AS points,
        (SELECT COUNT(*)::int FROM suki_rewards) AS rewards`, [membership])).rows[0];
    expect(state).toEqual({ points: 1000, rewards: 0 });
  });
}, 90000);
