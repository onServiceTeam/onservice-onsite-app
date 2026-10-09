import { getStaffPerformance, listStaffWithPerformance } from '../src/services/provider-staff.service';
import { draftIntegrationIt as it } from './helpers/provider-draft-postgres';
import { createTeamPerformanceFixture, withProviderTeamDatabase } from './helpers/provider-team-postgres';

it('Bug OPS-507 — team job totals use the canonical completed lifecycle states in both provider and admin projections', async () => {
  await withProviderTeamDatabase(async database => {
    const { providerId, staffId, secondStaffId } = await createTeamPerformanceFixture(database);
    const completed = ['completed_by_provider', 'confirmed', 'resolved', 'payout_ready', 'paid_out'];
    const other = ['requested', 'quoted', 'matched', 'payment_pending', 'paid', 'provider_en_route',
      'provider_arrived', 'in_progress', 'disputed', 'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin'];
    await database.query(`INSERT INTO bookings (id,provider_id,performer_staff_id,status)
      SELECT gen_random_uuid(), $1, $2, status FROM unnest($3::text[]) status`, [providerId, staffId, [...completed, ...other]]);
    const before = (await database.query('SELECT * FROM bookings ORDER BY id')).rows;
    expect(await getStaffPerformance(staffId)).toEqual({ totalJobs: 5, totalReviews: 0, averageRating: 0 });
    for (const role of [undefined, 'admin', 'super_admin'] as const) {
      const list = await listStaffWithPerformance(providerId, role);
      expect(list.find(row => row.id === staffId)?.performance).toEqual({ totalJobs: 5, totalReviews: 0, averageRating: 0 });
      expect(list.find(row => row.id === secondStaffId)?.performance).toEqual({ totalJobs: 0, totalReviews: 0, averageRating: 0 });
    }
    expect(await getStaffPerformance('11111111-1111-4111-8111-111111111111'))
      .toEqual({ totalJobs: 0, totalReviews: 0, averageRating: 0 });
    expect((await database.query('SELECT * FROM bookings ORDER BY id')).rows).toEqual(before);
  });
}, 30000);
