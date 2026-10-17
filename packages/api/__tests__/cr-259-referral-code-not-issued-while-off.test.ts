// CR-259 (customer review 2026-10-17, slice P2, discovery-support-1; D41 Q32
// option a): referral off switch. While referral_program_enabled is off,
// GET /referrals/my-code refuses with a plain message and hands out no new
// referral code (no referral_codes row is created), so no code is shared
// while a redeem would be refused. Real referral router and real SQL on the
// guarded PostgreSQL fixture.
import { customerUser, p2Http, p2It as it, withP2Database } from './helpers/p2-switches-postgres';
import referralRouter from '../src/routes/referral.routes';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug CR-259 — while referral bonuses are off, no referral code is handed out', async () => {
  await withP2Database(async database => {
    const http = p2Http([['/api/v1/referrals', referralRouter]]);
    const response = await http.get('/api/v1/referrals/my-code', { userId: customerUser, role: 'customer' });

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      message: 'Referral bonuses are not available right now.',
      statusCode: 409,
      code: 'referral_program_off',
    });
    expect((await database.query('SELECT COUNT(*)::int AS n FROM referral_codes')).rows[0].n).toBe(0);
  });
}, 90000);
