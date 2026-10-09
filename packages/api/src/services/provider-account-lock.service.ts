import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';

type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Call at the START of the same transaction that will change this provider and
// its owner. Do not first acquire provider, refresh-token or booking row locks.
// Status, evidence, admission and account eligibility still belong to the caller.
export async function lockProviderAccount(client: TransactionClient, providerId: string): Promise<void> {
  // Owner before provider, matching draft/initial submission. Lock only the
  // account here, not the provider read by the scalar subquery. NO KEY UPDATE
  // serializes account changes without blocking FK key-share checks (e.g.
  // session creation). These operations never change user IDs.
  const owner = await client.query<{ id: string }>(
    `SELECT u.id FROM users u
       WHERE u.id = (SELECT p.user_id FROM providers p WHERE p.id = $1)
       FOR NO KEY UPDATE OF u`, [providerId],
  );
  if (!owner.rows[0]) throw createAppError('Provider not found.', 404);
  const provider = await client.query<{ user_id: string }>(
    'SELECT user_id FROM providers WHERE id = $1 FOR UPDATE', [providerId],
  );
  if (!provider.rows[0]) throw createAppError('Provider not found.', 404);
  // Recheck ownership after waiting; never operate on a different, unlocked
  // account or chase its lock. Migration 173 separately prevents owner changes
  // for preserved submissions; legacy rows may lack that protection.
  if (provider.rows[0].user_id !== owner.rows[0].id) {
    const conflict = createAppError('The provider account owner changed. Reload before continuing.', 409);
    conflict.code = 'provider_account_owner_conflict';
    throw conflict;
  }
}
