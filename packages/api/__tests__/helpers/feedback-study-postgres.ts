// Real-database fixture for tester feedback version 2: the real migration 181
// on a test-owned schema, the real public routes over HTTP (rate limiters
// mocked by each test file), and a private temporary upload folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { Pool } from 'pg';
import { withPasswordDatabase, passwordIntegrationIt, passwordOwner } from './admin-password-postgres';

export const feedbackIntegrationIt = passwordIntegrationIt;
export const superAdminId = passwordOwner;
export const adminId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

export async function withFeedbackDatabase(run: (database: Pool, uploadRoot: string) => Promise<void>): Promise<void> {
  const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'onservice-feedback-v2-'));
  process.env.TEST_FEEDBACK_UPLOAD_DIR = uploadRoot;
  try {
    await withPasswordDatabase(async database => {
      await database.query(`
        CREATE TABLE audit_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id),
          action varchar(100) NOT NULL, entity_type varchar(50) NOT NULL, entity_id uuid,
          old_values jsonb, new_values jsonb, created_at timestamptz NOT NULL DEFAULT NOW());
      `);
      await database.query(fs.readFileSync(path.resolve(__dirname, '../../migrations/181_feedback_study_v2.sql'), 'utf8'));
      await database.query(`INSERT INTO users (id, role, email) VALUES ($1, 'super_admin', 'synthetic-super@example.invalid'),
        ($2, 'admin', 'synthetic-admin@example.invalid')`, [superAdminId, adminId]);
      await run(database, uploadRoot);
    });
  } finally {
    delete process.env.TEST_FEEDBACK_UPLOAD_DIR;
    fs.rmSync(uploadRoot, { recursive: true, force: true });
  }
}

export async function feedbackApp(): Promise<express.Express> {
  const { default: router } = await import('../../src/routes/feedback-study.routes');
  const { errorMiddleware } = await import('../../src/middleware/error.middleware');
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/v2', router);
  app.use(errorMiddleware);
  return app;
}

// A structurally valid PNG with an EXIF chunk and a text chunk in it.
export function pngWithMetadata(): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
  };
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', Buffer.alloc(13, 1)), chunk('eXIf', Buffer.from('GPS 10.3157 N 123.8854 E', 'latin1')),
    chunk('tEXt', Buffer.from('Comment\0taken at home', 'latin1')), chunk('IDAT', Buffer.from('picture-data', 'latin1')),
    chunk('IEND', Buffer.alloc(0))]);
}

export const validWrapup = {
  kind: 'wrapup',
  // Alternating best answers: positive items 5, negative items 1 -> SUS 100.
  sus: [5, 1, 5, 1, 5, 1, 5, 1, 5, 1],
  answers: { change_1: 'Bigger buttons', change_2: 'Show prices sooner', change_3: 'Fewer steps to book',
    would_use: 'Maybe, if workers are checked' },
  prices: { aircon_clean: { too_cheap: 300, bargain: 600, expensive: 1200, too_expensive: 2000 } },
};
