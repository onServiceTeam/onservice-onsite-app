import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import providerAdminRouter from '../../src/routes/provider-admin.routes';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { createProviderApplication } from '../../src/services/provider.service';
import { applicantId, submissionInput, withSubmissionDatabase } from './provider-submission-postgres';

export const revisionReviewerId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export const revisionOtherOwnerId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const syntheticSecret = 'revision-review-test-only-not-a-real-credential';

export function reviewCredential(role = 'admin', userId = revisionReviewerId): string {
  return jwt.sign({ userId, role, sessionVersion: 1, type: 'access' }, syntheticSecret, { expiresIn: '5m' });
}

export function revisionReviewApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/v1/admin/providers', providerAdminRouter);
  app.use(errorMiddleware);
  return app;
}

export async function withRevisionReviewDatabase(run: (fixture: {
  database: Pool; providerId: string; revisionId: string; legacyProviderId: string;
}) => Promise<void>): Promise<void> {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = syntheticSecret;
  try {
    await withSubmissionDatabase(async database => {
      await database.query("INSERT INTO users (id,role) VALUES ($1,'admin'),($2,'customer')", [revisionReviewerId, revisionOtherOwnerId]);
      const provider = await createProviderApplication(applicantId, submissionInput);
      const revision = (await database.query('SELECT id FROM provider_application_revisions WHERE provider_id=$1', [provider.id])).rows[0];
      const legacy = await database.query(`INSERT INTO providers (user_id,business_name,service_radius_km)
        VALUES ($1,'Synthetic legacy without captured submission',10) RETURNING id`, [revisionOtherOwnerId]);
      await run({ database, providerId: provider.id, revisionId: revision.id, legacyProviderId: legacy.rows[0].id });
    });
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
}

// Synthetic later revisions exercise the actual migration's chain and reader.
// This is NOT a resubmission implementation, approval, or legacy backfill.
export async function appendSyntheticRevision(database: Pick<Pool, 'query'>, providerId: string, number: number): Promise<string> {
  const id = randomUUID();
  await database.query(`INSERT INTO provider_application_revisions (
    id,provider_id,submitted_by,revision_number,previous_revision_number,business_name,
    service_radius_km,latitude,longitude,city,province,service_area_id,service_area_name,
    category_ids,category_names,government_id_front_key,government_id_back_key,nbi_clearance_key,selfie_key,
    agreement_accepted_at,submitted_at
  ) SELECT $1,provider_id,submitted_by,$3,$3-1,'Synthetic later submission',
    service_radius_km,latitude,longitude,city,province,service_area_id,service_area_name,
    category_ids,category_names,'onboarding/' || submitted_by || '/later-front.jpg',
    government_id_back_key,nbi_clearance_key,selfie_key,agreement_accepted_at,NOW()
    FROM provider_application_revisions WHERE provider_id=$2 AND revision_number=1`, [id, providerId, number]);
  return id;
}
