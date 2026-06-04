// D15 — an approved staff member assigned to a booking (performer_staff_id) may
// upload on-site photos for that booking, acting on the provider's behalf. A
// staff member NOT assigned to the booking is rejected. Exercises the staff
// branch of booking-photo.service resolveBookingRole via uploadBookingPhoto.

const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...a: unknown[]) => dbQueryMock(...a) } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/upload.service', () => ({
  validateFile: jest.fn().mockResolvedValue(undefined),
  saveUploadedFile: jest.fn().mockResolvedValue({ filename: 'bookings/b1/photos/after/x.jpg', url: 'https://cdn/x.jpg' }),
  deleteUploadedFile: jest.fn().mockResolvedValue(undefined),
}));

import { uploadBookingPhoto } from '../src/services/booking-photo.service';

function bookingRow(staffUserId: string | null, staffStatus: string | null): Record<string, unknown> {
  return {
    id: 'b1',
    customer_id: 'cust-1',
    provider_user_id: 'owner-1',
    staff_user_id: staffUserId,
    staff_status: staffStatus,
  };
}

const baseArgs = {
  bookingId: 'b1',
  photoType: 'after' as const,
  buffer: Buffer.from([0xff, 0xd8, 0xff]),
  originalname: 'after.jpg',
  mimetype: 'image/jpeg',
};

beforeEach(() => { dbQueryMock.mockReset(); });

describe('D15 — staff booking-photo upload authorization', () => {
  it('lets the APPROVED assigned staff member upload (acting as provider)', async () => {
    dbQueryMock
      .mockResolvedValueOnce({ rows: [bookingRow('staff-1', 'approved')] }) // resolveBookingRole
      .mockResolvedValueOnce({ rows: [{ id: 'photo-1', uploaded_at: new Date() }] }); // INSERT

    const res = await uploadBookingPhoto({
      ...baseArgs,
      uploadedByUserId: 'staff-1',
      uploadedByRole: 'provider',
    });
    expect(res.id).toBe('photo-1');
    // The INSERT recorded the individual staff user in uploaded_by.
    const insertParams = dbQueryMock.mock.calls[1]![1] as unknown[];
    expect(insertParams[1]).toBe('staff-1');     // uploaded_by
    expect(insertParams[2]).toBe('provider');    // uploaded_by_role
  });

  it('rejects a staff member NOT assigned to the booking (403)', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [bookingRow('other-staff', 'approved')] });
    await expect(
      uploadBookingPhoto({ ...baseArgs, uploadedByUserId: 'staff-1', uploadedByRole: 'provider' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects an assigned-but-NOT-approved staff member (403)', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [bookingRow('staff-1', 'pending_review')] });
    await expect(
      uploadBookingPhoto({ ...baseArgs, uploadedByUserId: 'staff-1', uploadedByRole: 'provider' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
