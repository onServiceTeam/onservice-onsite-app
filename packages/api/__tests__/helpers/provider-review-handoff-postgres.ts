import type { Pool } from 'pg';
import { withSubmissionDatabase } from './provider-submission-postgres';

export const reviewerId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export const secondApplicantId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

// Real submission/profile/decision queries and migrations 172/173, within the same
// localhost *_test, unique-schema harness. This is a focused schema fixture,
// NOT a replacement for production-schema migration/release rehearsal.
export async function withReviewHandoffDatabase(run: (database: Pool) => Promise<void>): Promise<void> {
  await withSubmissionDatabase(async database => {
    await database.query(`
      ALTER TABLE users
        ADD COLUMN first_name text DEFAULT 'Synthetic', ADD COLUMN last_name text DEFAULT 'Applicant',
        ADD COLUMN phone text DEFAULT '+639170000000', ADD COLUMN email text,
        ADD COLUMN avatar_url text, ADD COLUMN is_verified boolean DEFAULT FALSE,
        ADD COLUMN last_login_at timestamptz, ADD COLUMN updated_at timestamptz DEFAULT NOW();
      ALTER TABLE providers
        ADD COLUMN description text DEFAULT '', ADD COLUMN tier text DEFAULT 'new',
        ADD COLUMN rating numeric DEFAULT 0, ADD COLUMN total_reviews integer DEFAULT 0,
        ADD COLUMN total_jobs integer DEFAULT 0, ADD COLUMN created_at timestamptz DEFAULT NOW(),
        ADD COLUMN rejection_reason text, ADD COLUMN nbi_expiry_notified boolean DEFAULT FALSE;
      ALTER TABLE provider_services ADD COLUMN subcategory_id uuid, ADD COLUMN base_price integer;
      CREATE TABLE service_subcategories (id uuid PRIMARY KEY, category_id uuid REFERENCES service_categories(id),
        name text, pricing_type text, base_price integer, hourly_rate integer, unit_label text,
        unit_price integer, min_price integer, max_price integer);
      CREATE TABLE refresh_tokens (user_id uuid REFERENCES users(id));
      CREATE TABLE bookings (id uuid PRIMARY KEY, provider_id uuid REFERENCES providers(id));
      CREATE TABLE support_tickets (id uuid PRIMARY KEY, user_id uuid, booking_id uuid,
        status text, priority text, assigned_agent_id uuid);
      CREATE TABLE provider_staff (id uuid PRIMARY KEY, user_id uuid, provider_id uuid);
      CREATE TABLE service_area_change_requests (id uuid PRIMARY KEY, provider_id uuid, status text);
      CREATE TABLE provider_certifications (id uuid PRIMARY KEY, provider_id uuid,
        name text, issuing_body text, certificate_number text, certificate_url text,
        issued_date date, expiry_date date, is_verified boolean, verified_at timestamptz,
        created_at timestamptz, is_active boolean);
      CREATE TABLE provider_portfolios (id uuid PRIMARY KEY, provider_id uuid, image_url text,
        caption text, customer_consent_confirmed_at timestamptz, created_at timestamptz,
        is_active boolean, display_order integer);
      ALTER TABLE admin_actions ADD COLUMN admin_id uuid REFERENCES users(id),
        ADD COLUMN action_type text, ADD COLUMN target_type text, ADD COLUMN target_id uuid,
        ADD COLUMN details jsonb, ADD COLUMN reason text, ADD COLUMN full_notes text;
      ALTER TABLE notifications ADD COLUMN user_id uuid REFERENCES users(id),
        ADD COLUMN type text, ADD COLUMN title text, ADD COLUMN body text, ADD COLUMN data jsonb;
    `);
    await database.query("INSERT INTO users (id,role) VALUES ($1,'super_admin'),($2,'customer')", [reviewerId, secondApplicantId]);
    await run(database);
  });
}
