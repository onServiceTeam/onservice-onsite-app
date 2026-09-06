import { draftIntegrationIt as it } from './helpers/provider-draft-postgres';
import { withProviderNotesDatabase } from './helpers/provider-notes-postgres';

// Replace source/comment matching with actual authenticated HTTP, service,
// transaction and PostgreSQL evidence. No new product behavior is introduced.
it('Bug PHASE164-01 — provider-note deletion enforces trimmed reason bounds and preserves the full accepted rationale', async () => {
  await withProviderNotesDatabase(async ({ database, createNote, removeNote }) => {
    const rejectedId = await createNote();
    const before = (await database.query('SELECT * FROM provider_admin_notes WHERE id=$1', [rejectedId])).rows;
    const auditsBefore = (await database.query('SELECT * FROM admin_actions ORDER BY id')).rows;
    for (const reason of ['', '   ', 'x'.repeat(9), 'x'.repeat(1001), `  ${'x'.repeat(1001)}  `]) {
      const response = await removeNote(rejectedId, reason);
      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe(reason.trim().length > 1000
        ? 'reason must be ≤ 1000 characters.' : 'reason must be at least 10 characters.');
      expect((await database.query('SELECT * FROM provider_admin_notes WHERE id=$1', [rejectedId])).rows).toEqual(before);
      expect((await database.query('SELECT * FROM admin_actions ORDER BY id')).rows).toEqual(auditsBefore);
    }
    for (const length of [10, 1000]) {
      const id = await createNote();
      const reason = 'x'.repeat(length);
      expect((await removeNote(id, `  ${reason}  `)).status).toBe(200);
      expect((await database.query('SELECT deleted_reason FROM provider_admin_notes WHERE id=$1', [id])).rows)
        .toEqual([{ deleted_reason: reason }]);
      expect((await database.query("SELECT reason,full_notes FROM admin_actions WHERE target_id=$1 AND action_type='provider_note_deleted'", [id])).rows)
        .toEqual([{ reason: reason.slice(0, 500), full_notes: reason }]);
    }
  });
}, 30000);
