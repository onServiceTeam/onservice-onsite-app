import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import type { Pool } from 'pg';
import { passwordOwner, withPasswordDatabase } from './admin-password-postgres';

export { passwordOwner as sessionOwner, passwordIntegrationIt as sessionIntegrationIt } from './admin-password-postgres';
export const sessionSecret = 'synthetic-account-session-test-secret';
export const sessionHash = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

// Focused UUID/FK/unique-key fixture for REAL service transactions. This is
// neither migration-chain acceptance nor a claim of complete erasure policy.
export async function withSessionDatabase(
  run: (database: Pool, token: string) => Promise<void>, role = 'customer',
): Promise<void> {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = sessionSecret;
  try {
    await withPasswordDatabase(async database => {
      await database.query(`
        ALTER TABLE users ADD UNIQUE (phone);
        CREATE TABLE providers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid UNIQUE NOT NULL REFERENCES users(id), status text DEFAULT 'active',
          business_name text DEFAULT 'Synthetic Business', description text DEFAULT 'Synthetic description',
          nbi_clearance_url text DEFAULT 'synthetic-private-key', updated_at timestamptz DEFAULT NOW());
        CREATE TABLE provider_services (provider_id uuid REFERENCES providers(id), is_active boolean DEFAULT TRUE);
        CREATE TABLE account_deletion_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES users(id), status text DEFAULT 'cooling_off',
          cooling_off_ends_at timestamptz DEFAULT NOW()-INTERVAL '1 day', processed_at timestamptz);
        CREATE TABLE bookings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid REFERENCES users(id),
          provider_id uuid REFERENCES providers(id), status text, total_amount numeric);
        CREATE TABLE disputes (booking_id uuid REFERENCES bookings(id), status text);
        CREATE TABLE wallets (user_id uuid REFERENCES users(id), available_balance numeric, pending_balance numeric);
        CREATE TABLE user_addresses (user_id uuid REFERENCES users(id), address text);
        CREATE TABLE push_tokens (user_id uuid REFERENCES users(id), token text);
        CREATE TABLE reviews (reviewer_id uuid REFERENCES users(id), comment text);
        CREATE TABLE messages (sender_id uuid REFERENCES users(id), content text);
        CREATE TABLE security_events (user_id uuid REFERENCES users(id), event_type text,
          ip_address inet, device_fingerprint text, metadata jsonb);
      `);
      await database.query(fs.readFileSync(path.resolve(__dirname, '../../migrations/175_verified_sign_in_email.sql'), 'utf8'));
      await database.query(`INSERT INTO users (id,role,email) VALUES ($1,$2,'synthetic-session@example.invalid')`, [passwordOwner, role]);
      const token = jwt.sign({ userId: passwordOwner, role, sessionVersion: 1, type: 'refresh' }, sessionSecret,
        { algorithm: 'HS256', expiresIn: 3600 });
      await database.query(`INSERT INTO refresh_tokens (user_id,token_hash,expires_at,device_fingerprint)
        VALUES ($1,$2,NOW()+INTERVAL '1 hour','synthetic-fingerprint')`, [passwordOwner, sessionHash(token)]);
      await run(database, token);
    });
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
}

export async function seedDeletion(database: Pool): Promise<void> {
  await database.query('INSERT INTO account_deletion_requests (user_id) VALUES ($1)', [passwordOwner]);
  await database.query("INSERT INTO user_addresses VALUES ($1,'Synthetic address')", [passwordOwner]);
  await database.query("INSERT INTO push_tokens VALUES ($1,'synthetic-push')", [passwordOwner]);
  await database.query("INSERT INTO reviews VALUES ($1,'Synthetic review')", [passwordOwner]);
  await database.query("INSERT INTO messages VALUES ($1,'Synthetic message')", [passwordOwner]);
  await database.query("INSERT INTO bookings (customer_id,status,total_amount) VALUES ($1,'paid_out',12345)", [passwordOwner]);
}
