import request from 'supertest';
import type { Pool } from 'pg';
import { enrollmentApp, enrollmentToken, enrollmentOwner, withEnrollmentDatabase } from './admin-enrollment-postgres';
import { generateBackupCodes } from '../../src/services/admin-2fa.service';
export { enrollmentIt as verificationIt, within } from './admin-enrollment-postgres';
export { enrollmentOwner as verificationOwner } from './admin-enrollment-postgres';

export function requestVerification(proof: { totpCode?: string; backupCode?: string }, role = 'admin') {
  return request(enrollmentApp).post('/auth/admin/2fa/verify').send({
    preAuthToken: enrollmentToken(role, 'pre_auth_2fa'), ...proof,
  });
}

export async function withVerificationDatabase(
  run: (database: Pool, totpSecret: string, codes: string[]) => Promise<void>, role = 'admin',
): Promise<void> {
  await withEnrollmentDatabase(async (database, secret) => {
    await database.query('UPDATE users SET totp_enabled=TRUE WHERE id=$1', [enrollmentOwner]);
    const bundle = await generateBackupCodes(enrollmentOwner);
    await run(database, secret, bundle.codes);
  }, role);
}

export async function waitForVerificationLock(database: Pool, blockerPid: number): Promise<void> {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const waiting = await database.query<{ waiting: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_stat_activity
        WHERE application_name=current_setting('application_name')
          AND $1::int=ANY(pg_blocking_pids(pid))) AS waiting`, [blockerPid],
    );
    if (waiting.rows[0]?.waiting) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Verification did not wait for the actual account lock.');
}
