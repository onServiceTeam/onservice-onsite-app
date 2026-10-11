import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { acceptInvite, listInvitesForUser } from '../src/services/provider-staff.service';
import { sessionIntegrationIt as it, sessionOwner, withSessionDatabase } from './helpers/account-session-postgres';

// D37 review (2026-10-12): a mobile number typed at email sign-up is never
// proven by SMS (phone_verified_at NULL). Before D37 every account number was
// SMS-proven, so team invites addressed to a phone could trust it. Now an
// unproven number must not claim such an invite. Real PostgreSQL with
// migration 180 and the real invite queries.

const ownerPhone = '+639170000000';

async function withInvite(run: (database: Pool, staffId: string) => Promise<void>, invite: { phone?: string; email?: string }) {
  await withSessionDatabase(async database => {
    const providerUser = crypto.randomUUID();
    await database.query(`INSERT INTO users (id, role, email, phone) VALUES ($1, 'provider', 'synthetic-provider@example.invalid', '+639179999999')`,
      [providerUser]);
    const provider = (await database.query<{ id: string }>(
      'INSERT INTO providers (user_id, business_name) VALUES ($1, $2) RETURNING id', [providerUser, 'Synthetic Aircon Co'],
    )).rows[0]!.id;
    await database.query(`CREATE TABLE provider_staff (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id uuid NOT NULL REFERENCES providers(id), user_id uuid REFERENCES users(id), status text NOT NULL,
      role_title text, invite_phone text, invite_email text, invite_expires_at timestamptz,
      submitted_for_review_at timestamptz, created_at timestamptz DEFAULT NOW(), updated_at timestamptz DEFAULT NOW())`);
    const staffId = (await database.query<{ id: string }>(
      `INSERT INTO provider_staff (provider_id, status, role_title, invite_phone, invite_email)
       VALUES ($1, 'invited', 'Technician', $2, $3) RETURNING id`, [provider, invite.phone ?? null, invite.email ?? null],
    )).rows[0]!.id;
    await run(database, staffId);
  });
}

it('D37 - an unproven number from email sign-up cannot see or accept an invite addressed to that phone', async () => {
  await withInvite(async (database, staffId) => {
    await database.query('UPDATE users SET phone_verified_at = NULL WHERE id = $1', [sessionOwner]);
    expect(await listInvitesForUser(sessionOwner)).toEqual([]);
    await expect(acceptInvite(staffId, sessionOwner)).rejects.toMatchObject({ statusCode: 403 });
    expect((await database.query('SELECT user_id, status FROM provider_staff WHERE id = $1', [staffId])).rows)
      .toEqual([{ user_id: null, status: 'invited' }]);
    expect((await database.query('SELECT role FROM users WHERE id = $1', [sessionOwner])).rows).toEqual([{ role: 'customer' }]);
  }, { phone: ownerPhone });
}, 30000);

it('D37 - an SMS-proven number still finds and accepts its phone invite', async () => {
  await withInvite(async (database, staffId) => {
    expect((await listInvitesForUser(sessionOwner)).map(row => row.staffId)).toEqual([staffId]);
    await acceptInvite(staffId, sessionOwner);
    expect((await database.query('SELECT user_id, status FROM provider_staff WHERE id = $1', [staffId])).rows)
      .toEqual([{ user_id: sessionOwner, status: 'pending_review' }]);
  }, { phone: ownerPhone });
}, 30000);

it('D37 - an email-addressed invite still matches an account created by email sign-up', async () => {
  await withInvite(async (database, staffId) => {
    await database.query('UPDATE users SET phone_verified_at = NULL, email_verified_at = NOW() WHERE id = $1', [sessionOwner]);
    expect((await listInvitesForUser(sessionOwner)).map(row => row.staffId)).toEqual([staffId]);
    await acceptInvite(staffId, sessionOwner);
    expect((await database.query('SELECT role FROM users WHERE id = $1', [sessionOwner])).rows).toEqual([{ role: 'provider_staff' }]);
  }, { email: 'SYNTHETIC-session@example.invalid' });
}, 30000);
