import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';
import providerAdminRouter from '../../src/routes/provider-admin.routes';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { withDraftDatabase, draftOwner, otherDraftOwner } from './provider-draft-postgres';

export const noteAuthor = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export const otherNoteAdmin = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
export const noteSuperAdmin = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

export async function withProviderNotesDatabase(run: (fixture: {
  database: Pool; providerId: string; otherProviderId: string;
  api: ReturnType<typeof request>; token: (userId?: string, role?: string) => string;
  createNote: (body?: string) => Promise<string>;
  removeNote: (noteId: string, reason?: string, userId?: string, role?: string) => request.Test;
}) => Promise<void>): Promise<void> {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'provider-note-http-test-only-not-a-real-credential';
  const token = (userId = noteAuthor, role = 'admin') => jwt.sign(
    { userId, role, sessionVersion: 1, type: 'access' }, process.env.JWT_SECRET!, { expiresIn: '5m' },
  );
  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin/providers', providerAdminRouter);
  app.use(errorMiddleware);
  const api = request(app);
  try {
    // Reuse only the guarded localhost *_test / unique-schema setup. Apply
    // actual note/audit migrations to synthetic parent tables, not production.
    // The local UUID shim supports PG17; UUID version behavior is not tested.
    await withDraftDatabase(async database => {
      await database.query(`
        CREATE FUNCTION uuidv7() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';
        ALTER TABLE users ADD COLUMN first_name text DEFAULT 'Synthetic', ADD COLUMN last_name text DEFAULT 'Operator';
        CREATE TABLE business_members (business_account_id uuid, user_id uuid);
        CREATE TABLE admin_roles (name text);
        CREATE TABLE admin_actions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_id uuid NOT NULL REFERENCES users(id),
          action_type varchar(50) NOT NULL, target_type varchar(30) NOT NULL, target_id uuid NOT NULL,
          details jsonb, reason text, created_at timestamptz NOT NULL DEFAULT NOW());
      `);
      for (const migration of ['052_provider_admin_notes.sql', '075_d06_admin_actions_full_notes_and_verbs.sql',
        '076_d06_soft_delete_columns.sql', '120_phase24_admin_actions_missing_verbs.sql',
        '121_phase25_admin_actions_dropped_verbs.sql', '159_provider_note_update_audit.sql']) {
        await database.query(await readFile(path.resolve(__dirname, '../../migrations', migration), 'utf8'));
      }
      await database.query("INSERT INTO users (id,role) VALUES ($1,'admin'),($2,'admin'),($3,'super_admin')",
        [noteAuthor, otherNoteAdmin, noteSuperAdmin]);
      const providers = await database.query('INSERT INTO providers (user_id) VALUES ($1),($2) RETURNING id,user_id',
        [draftOwner, otherDraftOwner]);
      const providerId = providers.rows.find(row => row.user_id === draftOwner).id as string;
      const otherProviderId = providers.rows.find(row => row.user_id === otherDraftOwner).id as string;
      const createNote = async (body = 'Synthetic internal support note, not a real case.') => {
        const response = await api.post(`/api/v1/admin/providers/${providerId}/notes`)
          .auth(token(), { type: 'bearer' }).send({ body, category: 'general', pinned: false });
        expect(response.status).toBe(201);
        expect(typeof response.body.data.id).toBe('string');
        return response.body.data.id as string;
      };
      const removeNote = (noteId: string, reason = 'Duplicate support note recorded.', userId = noteAuthor, role = 'admin') =>
        api.delete(`/api/v1/admin/providers/${providerId}/notes/${noteId}`)
          .auth(token(userId, role), { type: 'bearer' }).send({ reason });
      await run({ database, providerId, otherProviderId, api, token, createNote, removeNote });
    });
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
}

export async function waitForNoteWriters(database: Pool, blockerPid: number, count: number): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    // The second writer may queue behind the first. Observe the actual waiting
    // set and its dependency on our barrier, not an arbitrary sleep duration.
    const result = await database.query<{ count: number; barrier: boolean }>(`SELECT count(*)::int AS count,
      bool_or($1::int=ANY(pg_blocking_pids(pid))) AS barrier FROM pg_stat_activity
      WHERE application_name=current_setting('application_name') AND cardinality(pg_blocking_pids(pid)) > 0`, [blockerPid]);
    if ((result.rows[0]?.count ?? 0) >= count && result.rows[0]?.barrier) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Provider-note writers did not reach the observed database lock barrier.');
}
