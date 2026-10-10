import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';
import { withReviewHandoffDatabase } from './provider-review-handoff-postgres';
import { applicantId } from './provider-submission-postgres';

export async function withProviderTeamDatabase(run: (database: Pool) => Promise<void>): Promise<void> {
  await withReviewHandoffDatabase(async database => {
    // This is ONLY the unique test-owned schema from the guarded localhost
    // *_test harness. Replace its empty three-column staff stub with the real
    // migration 131 table, retaining the actual 172/173 submission schema.
    // Not a full production migration-chain rehearsal.
    await database.query(`
      DROP TABLE provider_staff;
      ALTER TABLE bookings ADD COLUMN status text NOT NULL DEFAULT 'paid';
      CREATE TABLE reviews (id uuid PRIMARY KEY, rating integer NOT NULL, is_visible boolean NOT NULL DEFAULT TRUE);
    `);
    await database.query(await readFile(path.resolve(__dirname, '../../migrations/131_provider_staff.sql'), 'utf8'));
    await run(database);
  });
}

export async function createTeamPerformanceFixture(database: Pool): Promise<{
  providerId: string; staffId: string; secondStaffId: string;
}> {
  const provider = await database.query(`INSERT INTO providers (user_id,business_name,service_radius_km,status)
    VALUES ($1,'Synthetic team metrics',10,'approved') RETURNING id`, [applicantId]);
  const providerId = provider.rows[0].id as string;
  const staff = await database.query(`INSERT INTO provider_staff (provider_id,role_title,status)
    VALUES ($1,'First fixture member','approved'),($1,'Second fixture member','approved') RETURNING id`, [providerId]);
  return { providerId, staffId: staff.rows[0].id as string, secondStaffId: staff.rows[1].id as string };
}
