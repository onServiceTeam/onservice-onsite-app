// CR-270 (customer review 2026-10-17, slice P2; D41 Q33 option a): while
// Suki is off, a confirmed booking still records the Suki booking count,
// tier and points (nothing is lost if Ken turns Suki on later), but the
// "Suki Tier Up!" notice is not sent: it promises a discount that is not
// given while the switch is off. Control: with the switch on, the same tier
// change sends the notice. Real recordBookingForSuki, guarded PostgreSQL
// fixture.
import {
  approvedProvider, customerUser, p2It as it, referrerUser, setSettingRow, withP2Database,
} from './helpers/p2-switches-postgres';
import { recordBookingForSuki } from '../src/services/suki.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug CR-270 — while Suki is off, a tier change is recorded but no tier-up notice promising a discount is sent', async () => {
  await withP2Database(async database => {
    // One booking short of the 'suki' tier (10 bookings) for both customers.
    await database.query(`INSERT INTO suki_memberships (customer_id, provider_id, total_bookings, tier)
        VALUES ($1, $3, 9, 'regular'), ($2, $3, 9, 'regular')`, [customerUser, referrerUser, approvedProvider]);
    const bookingFor = async (customer: string): Promise<string> => (await database.query<{ id: string }>(
      `INSERT INTO bookings (customer_id, status) VALUES ($1, 'confirmed') RETURNING id`, [customer],
    )).rows[0]!.id;

    const off = await recordBookingForSuki(customerUser, approvedProvider, await bookingFor(customerUser), 150000);
    expect({ tier: off.membership.tier, tierChanged: off.tierChanged }).toEqual({ tier: 'suki', tierChanged: true });
    expect((await database.query('SELECT COUNT(*)::int AS n FROM notifications')).rows[0].n).toBe(0);
    expect((await database.query(`SELECT type FROM suki_rewards ORDER BY type`)).rows)
      .toEqual([{ type: 'bonus' }, { type: 'earned' }]);

    await setSettingRow(database, 'suki_program_enabled', 'true');
    const on = await recordBookingForSuki(referrerUser, approvedProvider, await bookingFor(referrerUser), 150000);
    expect(on.tierChanged).toBe(true);
    expect((await database.query(`SELECT user_id, type, title FROM notifications`)).rows)
      .toEqual([{ user_id: referrerUser, type: 'suki', title: 'Suki Tier Up!' }]);
  });
}, 90000);
