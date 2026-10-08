import type { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProviderApplicationInput } from '../../src/services/provider.service';
import { withDraftDatabase } from './provider-draft-postgres';

export const applicantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const applicationAreaId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const applicationCategoryId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const submissionInput: ProviderApplicationInput = {
  businessName: 'Submission Test Services', categoryIds: [applicationCategoryId],
  serviceAreaId: applicationAreaId, serviceRadiusKm: 15,
  latitude: 10.32, longitude: 123.89, city: 'Untrusted city', province: 'Untrusted province',
  governmentIdFrontUrl: `https://uploads.example/onboarding/${applicantId}/front.jpg`,
  governmentIdBackUrl: `https://uploads.example/onboarding/${applicantId}/back.jpg`,
  nbiClearanceUrl: `https://uploads.example/onboarding/${applicantId}/nbi.jpg`,
  selfieUrl: `https://uploads.example/onboarding/${applicantId}/selfie.jpg`,
  nbiExpiryDate: '2028-02-29', governmentIdNumber: 'TEST-ID-ONLY', yearsExperience: 5,
  vettingAnswers: { mainSkills: 'Cleaning', hasOwnTools: true, references: [
    { name: 'Test Reference', contact: 'test-reference@example.invalid', relation: 'Fixture only' },
  ] },
};

// Focused service/transaction fixture plus actual migrations 172/173/174, not a
// full migration-chain proof. The reused harness permits only localhost
// *_test, creates a unique schema, and removes only that test-owned schema.
export async function withSubmissionDatabase(run: (database: Pool) => Promise<void>): Promise<void> {
  await withDraftDatabase(async database => {
    await database.query(`
      DELETE FROM providers;
      DELETE FROM users;
      ALTER TABLE providers
        ADD COLUMN nbi_clearance_url text,
        ADD COLUMN government_id_front_url text,
        ADD COLUMN government_id_back_url text,
        ADD COLUMN selfie_url text,
        ADD COLUMN reviewed_at timestamptz,
        ADD COLUMN updated_at timestamptz NOT NULL DEFAULT NOW(),
        ADD COLUMN business_name text NOT NULL,
        ADD COLUMN service_radius_km integer NOT NULL,
        ADD COLUMN latitude numeric,
        ADD COLUMN longitude numeric,
        ADD COLUMN city text,
        ADD COLUMN province text,
        ADD COLUMN nbi_expiry_date date,
        ADD COLUMN government_id_number text,
        ADD COLUMN years_experience integer,
        ADD COLUMN vetting_answers jsonb,
        ADD COLUMN ic_agreement_accepted_at timestamptz,
        ADD COLUMN applied_at timestamptz;
      CREATE TABLE service_areas (
        id uuid PRIMARY KEY, name text, city text, province text, status text,
        center_lat numeric, center_lng numeric, radius_km integer, is_default boolean DEFAULT FALSE
      );
      CREATE TABLE service_categories (id uuid PRIMARY KEY, name text NOT NULL DEFAULT 'Cleaning', is_active boolean NOT NULL DEFAULT TRUE);
      CREATE TABLE provider_service_areas (
        provider_id uuid REFERENCES providers(id), service_area_id uuid REFERENCES service_areas(id),
        is_primary boolean, UNIQUE (provider_id, service_area_id)
      );
      -- Production permits multiple category-only rows (the unique key uses
      -- nullable subcategory_id). Deliberately do not invent category uniqueness.
      CREATE TABLE provider_services (
        id serial PRIMARY KEY, provider_id uuid REFERENCES providers(id), category_id uuid, is_active boolean
      );
      CREATE TABLE admin_actions (id serial PRIMARY KEY);
      CREATE TABLE notifications (id serial PRIMARY KEY);
    `);
    await database.query(await readFile(path.resolve(__dirname, '../../migrations/173_provider_application_revisions.sql'), 'utf8'));
    await database.query(await readFile(path.resolve(__dirname, '../../migrations/174_provider_application_decisions.sql'), 'utf8'));
    await database.query("INSERT INTO users (id,role) VALUES ($1,'customer')", [applicantId]);
    await database.query(`INSERT INTO service_areas
      (id,name,city,province,status,center_lat,center_lng,radius_km,is_default)
      VALUES ($1,'Metro Cebu','Cebu City','Cebu','active',10.3157,123.8854,35,TRUE)`, [applicationAreaId]);
    await database.query('INSERT INTO service_categories (id) VALUES ($1)', [applicationCategoryId]);
    await run(database);
  });
}

export async function assertNoSubmission(database: Pool): Promise<void> {
  for (const table of ['providers', 'provider_service_areas', 'provider_services', 'provider_application_revisions', 'admin_actions', 'notifications']) {
    expect((await database.query(`SELECT count(*)::int AS count FROM ${table}`)).rows).toEqual([{ count: 0 }]);
  }
}
