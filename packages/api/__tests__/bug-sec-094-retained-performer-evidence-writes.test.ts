import * as uploadService from '../src/services/upload.service';
import { withStaffEvidenceDatabase, evidenceHttp, evidenceSnapshot, bookingB } from './helpers/staff-evidence-postgres';
import { bookingIntegrationIt as it, providerA } from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug SEC-094 - a team member still recorded as the performer on a booking of no or another provider cannot write its job evidence', async () => {
  // Booking B keeps provider B's approved team member as its performer, but
  // the booking itself has no provider, then belongs to provider A.
  for (const providerOnB of [null, providerA]) {
    await withStaffEvidenceDatabase(async (database, { staffUserId, itemOnB }) => {
      await database.query('UPDATE bookings SET provider_id=$2 WHERE id=$1', [bookingB, providerOnB]);
      const validate = jest.spyOn(uploadService, 'validateFile').mockResolvedValue(undefined);
      const store = jest.spyOn(uploadService, 'saveUploadedFile').mockResolvedValue({
        id: 'synthetic-file', url: 'https://storage.example.test/synthetic.jpg',
        filename: 'bookings/synthetic.jpg', mimeType: 'image/jpeg', sizeBytes: 12,
      });
      try {
        const http = evidenceHttp(staffUserId, 'provider_staff');
        const before = await evidenceSnapshot(database);

        // Before SEC-094 each writer accepted the retained performer: the
        // checklist item was ticked, the photos and signature were stored
        // and recorded, and a missing checklist was created.
        const tick = await http.tickItem(bookingB, itemOnB);
        const photo = await http.uploadPhoto(bookingB);
        const legacy = await http.legacyPhotos(bookingB);
        const signature = await http.uploadSignature(bookingB);
        expect(await evidenceSnapshot(database)).toEqual(before);
        // Opening the checklist creates it when none exists yet.
        await database.query('DELETE FROM booking_checklists WHERE booking_id=$1', [bookingB]);
        const withoutChecklist = await evidenceSnapshot(database);
        const open = await http.openChecklist(bookingB);
        expect(await evidenceSnapshot(database)).toEqual(withoutChecklist);

        expect([tick.status, photo.status, legacy.status, signature.status, open.status])
          .toEqual([403, 403, 403, 403, 403]);
        expect(store).not.toHaveBeenCalled();
      } finally {
        validate.mockRestore();
        store.mockRestore();
      }
    });
  }
}, 90000);
