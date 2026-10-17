// CR-402 (customer review 2026-10-17, slice P2, discovery-support-1, fix
// round; D41 Q32 option a): referral off switch. While referral bonuses are
// off, the my-referrals list refuses with the same plain message as the other
// referral calls, so an older app or a direct call gets no referral code and
// no peso amounts, even for a customer who already has a code and a credited
// bonus from before. Real referral router and real SQL on the guarded
// PostgreSQL fixture.
import { customerUser, p2Http, p2It as it, referrerUser, withP2Database } from './helpers/p2-switches-postgres';
import referralRouter from '../src/routes/referral.routes';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug CR-402 — while referral bonuses are off, the my-referrals list shows no code and no amounts', async () => {
  await withP2Database(async database => {
    // Juan already has a code from before, and one bonus of ₱50.00 was credited.
    const code = await database.query<{ id: string }>(
      `INSERT INTO referral_codes (user_id, code, referrer_bonus, referee_bonus)
       VALUES ($1, 'JUANDC50', 5000, 5000) RETURNING id`, [referrerUser]);
    await database.query(
      `INSERT INTO referral_redemptions (referral_code_id, referrer_id, referee_id, referrer_bonus,
          referee_bonus, referrer_credited, referee_credited)
       VALUES ($1, $2, $3, 5000, 5000, TRUE, TRUE)`, [code.rows[0]!.id, referrerUser, customerUser]);
    const http = p2Http([['/api/v1/referrals', referralRouter]]);

    const response = await http.get('/api/v1/referrals/my-referrals', { userId: referrerUser, role: 'customer' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      success: false,
      error: { message: 'Referral bonuses are not available right now.', statusCode: 409, code: 'referral_program_off' },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/JUANDC50|5000/);
  });
}, 90000);
