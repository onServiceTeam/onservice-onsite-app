// CR-258 (customer review 2026-10-17, slice P2, discovery-support-1; D41 Q32
// option a): referral off switch, the referrer side. When a referred
// customer's booking is confirmed, the referrer bonus is refused while
// referral_program_enabled is off: the referrer's wallet and ledger do not
// change, no notification is written, and the pending redemption stays
// pending (so nothing is lost if Ken later turns the program on with rules).
// The real creditReferrerAfterBooking runs on the guarded PostgreSQL fixture,
// first with the switch off, then (as a control) with it on.
import {
  customerUser, p2It as it, referrerUser, setSettingRow, walletSnapshot, withP2Database,
} from './helpers/p2-switches-postgres';
import { creditReferrerAfterBooking } from '../src/services/referral.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug CR-258 — while referral bonuses are off, the referrer bonus is refused and the redemption stays pending', async () => {
  await withP2Database(async database => {
    await database.query(`INSERT INTO wallets (user_id, type, available_balance) VALUES ($1, 'customer', 0)`, [referrerUser]);
    const code = (await database.query<{ id: string }>(`INSERT INTO referral_codes (user_id, code)
        VALUES ($1, 'JUANREF8') RETURNING id`, [referrerUser])).rows[0]!.id;
    await database.query(`INSERT INTO referral_redemptions (referral_code_id, referrer_id, referee_id, referrer_bonus, referee_bonus)
        VALUES ($1, $2, $3, 5000, 5000)`, [code, referrerUser, customerUser]);
    const booking = (await database.query<{ id: string }>(
      `INSERT INTO bookings (customer_id, status) VALUES ($1, 'confirmed') RETURNING id`, [customerUser],
    )).rows[0]!.id;
    const before = await walletSnapshot(database, [referrerUser]);

    expect(await creditReferrerAfterBooking(booking, customerUser)).toBe('program_off');
    expect(await walletSnapshot(database, [referrerUser])).toEqual(before);
    expect((await database.query(`SELECT referrer_credited, qualifying_booking_id FROM referral_redemptions`)).rows)
      .toEqual([{ referrer_credited: false, qualifying_booking_id: null }]);
    expect((await database.query('SELECT COUNT(*)::int AS n FROM notifications')).rows[0].n).toBe(0);

    // Control: the same pending bonus is paid once the switch is on, so the
    // refusal above came from the switch and not from the fixture.
    await setSettingRow(database, 'referral_program_enabled', 'true');
    expect(await creditReferrerAfterBooking(booking, customerUser)).toBe('credited');
    expect((await database.query(`SELECT available_balance::text AS balance FROM wallets WHERE user_id = $1`, [referrerUser]))
      .rows[0].balance).toBe('5000');
  });
}, 90000);
