import type { Pool } from 'pg';
import { withRevisionReviewDatabase } from './provider-revision-review-postgres';

// Real initial submission + migrations 172/173/174 in the guarded local-only harness.
// The remaining tables are focused transaction fixtures, not a full-chain rehearsal.
export async function withDecisionDatabase(run: (fixture: {
  database: Pool; providerId: string; revisionId: string; legacyProviderId: string;
}) => Promise<void>): Promise<void> {
  await withRevisionReviewDatabase(async fixture => {
    await fixture.database.query(`
      ALTER TABLE users ADD COLUMN updated_at timestamptz NOT NULL DEFAULT NOW();
      ALTER TABLE providers ADD COLUMN rejection_reason text;
      ALTER TABLE admin_actions
        ADD COLUMN admin_id uuid REFERENCES users(id), ADD COLUMN action_type text,
        ADD COLUMN target_type text, ADD COLUMN target_id uuid,
        ADD COLUMN details jsonb, ADD COLUMN reason text, ADD COLUMN full_notes text;
      ALTER TABLE notifications
        ADD COLUMN user_id uuid REFERENCES users(id), ADD COLUMN type text,
        ADD COLUMN title text, ADD COLUMN body text, ADD COLUMN data jsonb;
    `);
    await run(fixture);
  });
}
