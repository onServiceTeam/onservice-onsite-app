import { addAvailabilityOverride } from '../src/services/provider.service';
import { availabilityIntegrationIt as it, withAvailabilityDatabase, providerId, otherProviderId, waitForAvailabilityWriters } from './helpers/provider-availability-postgres';

it('Bug OPS-497 — failed or concurrent override replacement cannot lose the saved date or create overlapping duplicate windows', async () => {
  await withAvailabilityDatabase(async database => {
    await addAvailabilityOverride(providerId, { overrideDate: '2099-08-31', isAvailable: false, reason: 'Keep this block if the next save fails' });
    await addAvailabilityOverride(otherProviderId, { overrideDate: '2099-08-31', isAvailable: false, reason: 'Other owner' });
    const before = (await database.query('SELECT * FROM provider_availability_overrides ORDER BY provider_id')).rows;
    await database.query(`CREATE FUNCTION reject_synthetic_override() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.reason='synthetic-failure' THEN RAISE EXCEPTION 'Synthetic insert failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER synthetic_failure BEFORE INSERT ON provider_availability_overrides
      FOR EACH ROW EXECUTE FUNCTION reject_synthetic_override();`);
    await expect(addAvailabilityOverride(providerId, { overrideDate: '2099-08-31', isAvailable: true,
      startTime: '08:00', endTime: '09:00', reason: 'synthetic-failure' })).rejects.toThrow('Synthetic insert failure');
    expect((await database.query('SELECT * FROM provider_availability_overrides ORDER BY provider_id')).rows).toEqual(before);

    const blocker = await database.connect();
    const writes: Promise<unknown>[] = [];
    let committed = false;
    try {
      await blocker.query('BEGIN');
      const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      await blocker.query('SELECT id FROM providers WHERE id=$1 FOR UPDATE', [providerId]);
      for (const startTime of ['08:00', '09:00']) {
        const write = addAvailabilityOverride(providerId, { overrideDate: '2099-08-31', isAvailable: true,
          startTime, endTime: '10:00', reason: startTime });
        void write.catch(() => undefined); // handled by Promise.all after releasing the barrier
        writes.push(write);
      }
      await waitForAvailabilityWriters(database, pid, 2);
      await blocker.query('COMMIT'); committed = true;
      await Promise.all(writes);
    } finally {
      if (!committed) await blocker.query('ROLLBACK');
      blocker.release();
      await Promise.allSettled(writes);
    }
    const rows = (await database.query('SELECT * FROM provider_availability_overrides WHERE provider_id=$1', [providerId])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ is_available: true, end_time: '10:00:00' });
    expect(['08:00:00', '09:00:00']).toContain(rows[0].start_time);
    expect((await database.query('SELECT * FROM provider_availability_overrides WHERE provider_id=$1', [otherProviderId])).rows)
      .toEqual(before.filter(row => row.provider_id === otherProviderId));
  });
}, 30000);
