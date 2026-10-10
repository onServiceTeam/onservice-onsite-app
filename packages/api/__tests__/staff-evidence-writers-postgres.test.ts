import * as uploadService from '../src/services/upload.service';
import { withStaffEvidenceDatabase, evidenceHttp, evidenceSnapshot, bookingA, bookingB } from './helpers/staff-evidence-postgres';
import {
  bookingIntegrationIt as it, customerA, customerB, providerA, providerUserA, providerUserB,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// S1-10 supporting checks (SEC-094 is the bug test). Booking A belongs to
// provider B, and provider B's approved team member is its performer, so
// they and the provider owner keep every evidence writer (needed for T11).

function spyStorage() {
  const validate = jest.spyOn(uploadService, 'validateFile').mockResolvedValue(undefined);
  const store = jest.spyOn(uploadService, 'saveUploadedFile').mockResolvedValue({
    id: 'synthetic-file', url: 'https://storage.example.test/synthetic.jpg',
    filename: 'bookings/synthetic.jpg', mimeType: 'image/jpeg', sizeBytes: 12,
  });
  return { store, restore: () => { validate.mockRestore(); store.mockRestore(); } };
}

it('the approved team member of the booking\'s own provider still writes every kind of job evidence', async () => {
  await withStaffEvidenceDatabase(async (database, { staffUserId, itemOnA }) => {
    const storage = spyStorage();
    try {
      const http = evidenceHttp(staffUserId, 'provider_staff');

      expect((await http.tickItem(bookingA, itemOnA)).status).toBe(200);
      expect((await database.query('SELECT is_completed FROM booking_checklist_items WHERE id=$1', [itemOnA])).rows)
        .toEqual([{ is_completed: true }]);
      expect((await http.uploadPhoto(bookingA)).status).toBe(201);
      expect((await http.legacyPhotos(bookingA)).status).toBe(200);
      expect((await http.uploadSignature(bookingA)).status).toBe(201);
      await database.query('DELETE FROM booking_checklists WHERE booking_id=$1', [bookingA]);
      expect((await http.openChecklist(bookingA)).status).toBe(200);

      expect(storage.store).toHaveBeenCalledTimes(2);
      const after = await evidenceSnapshot(database);
      expect(after.photos.map(p => [p.booking_id, p.uploaded_by, p.uploaded_by_role]))
        .toEqual([[bookingA, staffUserId, 'provider'], [bookingA, staffUserId, 'provider']]);
      expect(after.signatures.map(s => [s.booking_id, s.signed_by, s.signed_role]))
        .toEqual([[bookingA, staffUserId, 'provider']]);
      expect(after.checklists.map(c => c.booking_id)).toContain(bookingA);
    } finally {
      storage.restore();
    }
  });
}, 60000);

it('on a booking the owner performs (no team member recorded), the owner keeps every writer and the customer keeps theirs', async () => {
  await withStaffEvidenceDatabase(async (database, { itemOnA }) => {
    // The normal case: performer_staff_id NULL means the provider owner works
    // the job (migration 131). The new join must not drop the booking row.
    await database.query('UPDATE bookings SET performer_staff_id=NULL WHERE id=$1', [bookingA]);
    const storage = spyStorage();
    try {
      const owner = evidenceHttp(providerUserB, 'provider');
      expect((await owner.tickItem(bookingA, itemOnA)).status).toBe(200);
      expect((await owner.uploadPhoto(bookingA)).status).toBe(201);
      expect((await owner.legacyPhotos(bookingA)).status).toBe(200);
      expect((await owner.uploadSignature(bookingA)).status).toBe(201);
      await database.query('DELETE FROM booking_checklists WHERE booking_id=$1', [bookingA]);
      expect((await owner.openChecklist(bookingA)).status).toBe(200);

      const customer = evidenceHttp(customerA, 'customer');
      expect((await customer.uploadPhoto(bookingA)).status).toBe(201);
      expect((await customer.uploadSignature(bookingA)).status).toBe(201);

      const after = await evidenceSnapshot(database);
      expect(after.photos.map(p => [p.uploaded_by, p.uploaded_by_role]).sort()).toEqual([
        [customerA, 'customer'], [providerUserB, 'provider'], [providerUserB, 'provider'],
      ].sort());
      expect(after.signatures.map(s => [s.signed_by, s.signed_role]).sort()).toEqual([
        [customerA, 'customer'], [providerUserB, 'provider'],
      ].sort());
      expect(after.checklists.map(c => c.booking_id)).toContain(bookingA);
    } finally {
      storage.restore();
    }
  });
}, 60000);

it('on a booking still recording another provider\'s team member, its current owner and customer keep their writers', async () => {
  await withStaffEvidenceDatabase(async (database, { itemOnB }) => {
    // Booking B now belongs to provider A but still records provider B's
    // team member as its performer (the SEC-094 shape).
    await database.query('UPDATE bookings SET provider_id=$2 WHERE id=$1', [bookingB, providerA]);
    const storage = spyStorage();
    try {
      expect((await evidenceHttp(providerUserA, 'provider').tickItem(bookingB, itemOnB)).status).toBe(200);
      expect((await database.query('SELECT is_completed FROM booking_checklist_items WHERE id=$1', [itemOnB])).rows)
        .toEqual([{ is_completed: true }]);
      expect((await evidenceHttp(customerB, 'customer').uploadPhoto(bookingB)).status).toBe(201);
      expect((await evidenceSnapshot(database)).photos.map(p => [p.booking_id, p.uploaded_by]))
        .toEqual([[bookingB, customerB]]);
    } finally {
      storage.restore();
    }
  });
}, 60000);

it('a team member of the right provider who is not approved still cannot write evidence', async () => {
  await withStaffEvidenceDatabase(async (database, { staffUserId, staffId, itemOnA }) => {
    await database.query("UPDATE provider_staff SET status='suspended' WHERE id=$1", [staffId]);
    const storage = spyStorage();
    try {
      const http = evidenceHttp(staffUserId, 'provider_staff');
      const before = await evidenceSnapshot(database);

      expect((await http.tickItem(bookingA, itemOnA)).status).toBe(403);
      expect((await http.uploadPhoto(bookingA)).status).toBe(403);
      expect((await http.legacyPhotos(bookingA)).status).toBe(403);
      expect((await http.uploadSignature(bookingA)).status).toBe(403);
      expect(storage.store).not.toHaveBeenCalled();
      expect(await evidenceSnapshot(database)).toEqual(before);
      await database.query('DELETE FROM booking_checklists WHERE booking_id=$1', [bookingA]);
      const withoutChecklist = await evidenceSnapshot(database);
      expect((await http.openChecklist(bookingA)).status).toBe(403);
      expect(await evidenceSnapshot(database)).toEqual(withoutChecklist);
    } finally {
      storage.restore();
    }
  });
}, 60000);
