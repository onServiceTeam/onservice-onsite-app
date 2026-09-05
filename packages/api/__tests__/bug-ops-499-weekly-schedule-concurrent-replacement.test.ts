import { getSchedule, setSchedule } from '../src/services/provider.service';
import { availabilityIntegrationIt as it, withAvailabilityDatabase, providerId, otherProviderId, waitForAvailabilityWriters } from './helpers/provider-availability-postgres';

it('Bug OPS-499 — concurrent whole-week replacements retain one submitted week instead of combining different saves', async () => {
  await withAvailabilityDatabase(async database => {
    const otherWeek = [{ dayOfWeek: 5, startTime: '13:00', endTime: '17:00', isAvailable: true }];
    await setSchedule(otherProviderId, otherWeek);
    await database.query(`INSERT INTO bookings (provider_id,status,scheduled_at,total_amount)
      VALUES ($1,'confirmed','2099-08-06T06:00:00+08:00',12345)`, [providerId]);
    const bookingsBefore = (await database.query('SELECT * FROM bookings')).rows;
    await database.query(`CREATE FUNCTION hold_weekly_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.provider_id='${providerId}'::uuid AND NEW.start_time IN ('10:00'::time,'11:00'::time) THEN
          PERFORM pg_advisory_xact_lock(hashtext(current_schema()),499);
        END IF;
        IF NEW.start_time='23:00'::time THEN RAISE EXCEPTION 'Synthetic weekly insert failure'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER synthetic_weekly_insert BEFORE INSERT ON provider_availability
      FOR EACH ROW EXECUTE FUNCTION hold_weekly_insert();`);

    // Both are valid complete replacement requests under the partial-week API.
    // Disjoint days expose the merge that a same-day UNIQUE constraint can hide.
    const submissions = [
      [{ dayOfWeek: 1, startTime: '10:00', endTime: '17:00', isAvailable: true }],
      [{ dayOfWeek: 2, startTime: '11:00', endTime: '17:00', isAvailable: true }],
    ];
    for (const initiallyEmpty of [true, false]) {
      await database.query('DELETE FROM provider_availability WHERE provider_id=$1', [providerId]);
      if (!initiallyEmpty) await setSchedule(providerId, [{ dayOfWeek: 3, startTime: '09:00', endTime: '17:00', isAvailable: true }]);
      const blocker = await database.connect();
      const writes: ReturnType<typeof setSchedule>[] = [];
      let committed = false;
      try {
        await blocker.query('BEGIN');
        const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
        await blocker.query('SELECT pg_advisory_xact_lock(hashtext(current_schema()),499)');
        for (const submission of submissions) {
          const write = setSchedule(providerId, submission);
          void write.catch(() => undefined); // observed by Promise.all after releasing the real barrier
          writes.push(write);
        }
        // Before the fix both DELETEs can start before either INSERT commits.
        // After the fix the second writer waits before DELETE on its provider.
        // Observe actual blocked sessions, not a timer guessing their progress.
        await waitForAvailabilityWriters(database, pid, 2);
        // A different provider can still save while these two writers wait.
        await setSchedule(otherProviderId, otherWeek);
        await blocker.query('COMMIT'); committed = true;
        const responses = await Promise.all(writes);
        for (let index = 0; index < submissions.length; index += 1) {
          expect(responses[index]).toHaveLength(1);
          expect(responses[index]![0]).toMatchObject({ day_of_week: submissions[index]![0]!.dayOfWeek });
        }
      } finally {
        if (!committed) await blocker.query('ROLLBACK');
        blocker.release();
        await Promise.allSettled(writes);
      }
      const saved = await getSchedule(providerId);
      expect(saved).toHaveLength(1);
      const fields = saved.map(row => ({ dayOfWeek: row.day_of_week, startTime: row.start_time.slice(0, 5),
        endTime: row.end_time.slice(0, 5), isAvailable: row.is_available }));
      expect(submissions).toContainEqual(fields); // either lock order is valid, a merged week is not
    }

    // Existing rollback behavior must survive the added serialization.
    const beforeFailure = await getSchedule(providerId);
    await expect(setSchedule(providerId, [{ dayOfWeek: 4, startTime: '23:00', endTime: '23:30', isAvailable: true }]))
      .rejects.toThrow('Synthetic weekly insert failure');
    expect(await getSchedule(providerId)).toEqual(beforeFailure);
    const otherSaved = await getSchedule(otherProviderId);
    expect(otherSaved).toHaveLength(1);
    expect(otherSaved[0]).toMatchObject({ day_of_week: 5, start_time: '13:00:00', end_time: '17:00:00', is_available: true });
    expect((await database.query('SELECT * FROM bookings')).rows).toEqual(bookingsBefore);
    await expect(setSchedule('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', submissions[0]!))
      .rejects.toMatchObject({ statusCode: 404 });
  });
}, 30000);
