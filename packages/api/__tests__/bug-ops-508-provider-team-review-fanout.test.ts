import { getStaffPerformance, listStaffWithPerformance } from '../src/services/provider-staff.service';
import { draftIntegrationIt as it } from './helpers/provider-draft-postgres';
import { createTeamPerformanceFixture, withProviderTeamDatabase } from './helpers/provider-team-postgres';

it('Bug OPS-508 — adding jobs does not multiply a team member’s visible review count', async () => {
  await withProviderTeamDatabase(async database => {
    const { providerId, staffId, secondStaffId } = await createTeamPerformanceFixture(database);
    await database.query(`INSERT INTO reviews (id,performer_staff_id,rating,is_visible)
      VALUES (gen_random_uuid(),$1,2,TRUE),(gen_random_uuid(),$1,4,TRUE),
        (gen_random_uuid(),$1,5,FALSE),(gen_random_uuid(),$2,5,TRUE)`, [staffId, secondStaffId]);
    const before = (await database.query('SELECT * FROM reviews ORDER BY id')).rows;
    expect(await getStaffPerformance(staffId)).toMatchObject({ totalReviews: 2, averageRating: 3 });
    await database.query(`INSERT INTO bookings (id,provider_id,performer_staff_id,status)
      SELECT gen_random_uuid(), $1, $2, 'paid' FROM generate_series(1,3)`, [providerId, staffId]);
    expect(await getStaffPerformance(staffId)).toEqual({ totalJobs: 0, totalReviews: 2, averageRating: 3 });
    await database.query("UPDATE bookings SET status='confirmed' WHERE performer_staff_id=$1", [staffId]);
    expect(await getStaffPerformance(staffId)).toEqual({ totalJobs: 3, totalReviews: 2, averageRating: 3 });
    for (const role of [undefined, 'admin', 'super_admin'] as const) {
      const list = await listStaffWithPerformance(providerId, role);
      expect(list.find(row => row.id === staffId)?.performance).toEqual({ totalJobs: 3, totalReviews: 2, averageRating: 3 });
      expect(list.find(row => row.id === secondStaffId)?.performance).toEqual({ totalJobs: 0, totalReviews: 1, averageRating: 5 });
    }
    await database.query('UPDATE reviews SET is_visible=FALSE WHERE performer_staff_id=$1', [staffId]);
    expect(await getStaffPerformance(staffId)).toEqual({ totalJobs: 3, totalReviews: 0, averageRating: 0 });
    const after = (await database.query('SELECT * FROM reviews ORDER BY id')).rows;
    expect(after).toEqual(before.map(row => row.performer_staff_id === staffId ? { ...row, is_visible: false } : row));
  });
}, 30000);
