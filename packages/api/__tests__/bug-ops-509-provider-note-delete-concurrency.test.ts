import type request from 'supertest';
import { draftIntegrationIt as it, draftOwner } from './helpers/provider-draft-postgres';
import { noteAuthor, otherNoteAdmin, noteSuperAdmin, waitForNoteWriters, withProviderNotesDatabase } from './helpers/provider-notes-postgres';

it('Bug OPS-509 — concurrent provider-note deletions report and audit only the actual deletion', async () => {
  await withProviderNotesDatabase(async ({ database, providerId, otherProviderId, api, token, createNote, removeNote }) => {
    const notesUrl = `/api/v1/admin/providers/${providerId}/notes`;
    const readNote = async (id: string) => (await database.query('SELECT * FROM provider_admin_notes WHERE id=$1', [id])).rows[0];
    const deletions = async (id: string) => (await database.query(
      "SELECT admin_id,target_type,target_id,details,reason,full_notes FROM admin_actions WHERE action_type='provider_note_deleted' AND target_id=$1", [id],
    )).rows;
    const noteId = await createNote();
    const before = await readNote(noteId);
    const blocker = await database.connect();
    const pending: Promise<request.Response>[] = [];
    try {
      await blocker.query('BEGIN');
      const pid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
      await blocker.query('SELECT id FROM provider_admin_notes WHERE id=$1 FOR UPDATE', [noteId]);
      pending.push(removeNote(noteId, 'First concurrent delete reason.').then(response => response));
      await waitForNoteWriters(database, pid, 1);
      pending.push(removeNote(noteId, 'Second concurrent delete reason.', noteSuperAdmin, 'super_admin').then(response => response));
      await waitForNoteWriters(database, pid, 2);
      // Contention on this note must not serialize an unrelated support note.
      const independentId = await createNote('Independent support note during contention.');
      expect((await removeNote(independentId)).status).toBe(200);
      await blocker.query('COMMIT');
      const responses = await Promise.all(pending);
      expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
      expect(responses.find(response => response.status === 409)?.body.error.message).toBe('Note already deleted.');
      const winner = responses[0]?.status === 200 ? noteAuthor : noteSuperAdmin;
      const winnerReason = winner === noteAuthor ? 'First concurrent delete reason.' : 'Second concurrent delete reason.';
      const deleted = await readNote(noteId);
      expect(deleted).toEqual({ ...before, deleted_at: expect.any(Date), deleted_by: winner, deleted_reason: winnerReason });
      expect(await deletions(noteId)).toEqual([{ admin_id: winner, target_type: 'provider_note', target_id: noteId,
        details: { providerId, originalAuthorId: noteAuthor }, reason: winnerReason, full_notes: winnerReason }]);
      expect((await api.get(notesUrl).auth(token(), { type: 'bearer' })).body.data).toEqual([]);
      expect((await removeNote(noteId)).status).toBe(409);
      expect((await deletions(noteId))).toHaveLength(1);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await Promise.allSettled(pending);
    }

    // Author ownership, cross-provider scope and role checks still protect a
    // live note. A super-admin override remains attributable and soft-only.
    const guardedId = await createNote();
    const guardedBefore = await readNote(guardedId);
    expect((await removeNote(guardedId, 'Other admin tries deleting.', otherNoteAdmin)).status).toBe(403);
    expect((await removeNote(guardedId, 'Customer tries deleting.', draftOwner, 'customer')).status).toBe(403);
    expect((await api.delete(`${notesUrl}/${guardedId}`).send({ reason: 'Unauthenticated delete attempt.' })).status).toBe(401);
    expect((await api.delete(`/api/v1/admin/providers/${otherProviderId}/notes/${guardedId}`)
      .auth(token(), { type: 'bearer' }).send({ reason: 'Wrong provider delete attempt.' })).status).toBe(404);
    expect(await readNote(guardedId)).toEqual(guardedBefore);
    expect(await deletions(guardedId)).toEqual([]);
    expect((await removeNote(guardedId, 'Approved override of duplicate note.', noteSuperAdmin, 'super_admin')).status).toBe(200);
    expect((await readNote(guardedId)).deleted_by).toBe(noteSuperAdmin);

    // An audit failure must roll back the real row update; no success reply or
    // erased note is permitted when the durable audit cannot be written.
    const rollbackId = await createNote();
    const rollbackBefore = await readNote(rollbackId);
    await database.query(`CREATE FUNCTION fail_note_delete_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action_type='provider_note_deleted' THEN RAISE EXCEPTION 'Synthetic note audit failure'; END IF;
      RETURN NEW; END $$;
      CREATE TRIGGER fail_note_delete_audit BEFORE INSERT ON admin_actions FOR EACH ROW EXECUTE FUNCTION fail_note_delete_audit();`);
    expect((await removeNote(rollbackId)).status).toBe(500);
    expect(await readNote(rollbackId)).toEqual(rollbackBefore);
    expect(await deletions(rollbackId)).toEqual([]);
    await database.query('DROP TRIGGER fail_note_delete_audit ON admin_actions');
    expect((await removeNote(rollbackId)).status).toBe(200);

    // Even a suppressed UPDATE cannot manufacture a successful audit entry.
    // This trigger exists only in this unique test-owned schema.
    const suppressedId = await createNote();
    const suppressedBefore = await readNote(suppressedId);
    await database.query(`CREATE FUNCTION suppress_note_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      RETURN NULL; END $$;
      CREATE TRIGGER suppress_note_delete BEFORE UPDATE ON provider_admin_notes FOR EACH ROW EXECUTE FUNCTION suppress_note_delete();`);
    expect((await removeNote(suppressedId)).status).toBe(409);
    expect(await readNote(suppressedId)).toEqual(suppressedBefore);
    expect(await deletions(suppressedId)).toEqual([]);
    await database.query('DROP TRIGGER suppress_note_delete ON provider_admin_notes');

    // Both orders of an edit/delete race must preserve the committed note and
    // audit sequence, with no successful edit after the note is deleted.
    for (const deleteFirst of [true, false]) {
      const raceId = await createNote('Before concurrent edit.');
      const raceBlocker = await database.connect();
      const racePending: Promise<request.Response>[] = [];
      try {
        await raceBlocker.query('BEGIN');
        const pid = (await raceBlocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
        await raceBlocker.query('SELECT id FROM provider_admin_notes WHERE id=$1 FOR UPDATE', [raceId]);
        const edit = () => api.patch(`${notesUrl}/${raceId}`).auth(token(), { type: 'bearer' })
          .send({ body: 'After concurrent edit.', pinned: true }).then(response => response);
        const remove = () => removeNote(raceId).then(response => response);
        racePending.push(deleteFirst ? remove() : edit());
        await waitForNoteWriters(database, pid, 1);
        racePending.push(deleteFirst ? edit() : remove());
        await waitForNoteWriters(database, pid, 2);
        await raceBlocker.query('COMMIT');
        expect((await Promise.all(racePending)).map(response => response.status)).toEqual(deleteFirst ? [200, 404] : [200, 200]);
        expect(await readNote(raceId)).toMatchObject({ body: deleteFirst ? 'Before concurrent edit.' : 'After concurrent edit.',
          pinned: !deleteFirst, deleted_at: expect.any(Date) });
        expect(await deletions(raceId)).toHaveLength(1);
        const edits = (await database.query("SELECT details FROM admin_actions WHERE action_type='provider_note_updated' AND target_id=$1", [raceId])).rows;
        expect(edits).toEqual(deleteFirst ? [] : [{ details: { providerId, bodyChanged: true,
          categoryBefore: 'general', categoryAfter: 'general', pinnedBefore: false, pinnedAfter: true } }]);
      } finally {
        await raceBlocker.query('ROLLBACK');
        raceBlocker.release();
        await Promise.allSettled(racePending);
      }
    }
  });
}, 30000);
