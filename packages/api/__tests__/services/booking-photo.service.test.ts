// Phase 14 Dispatch 07 — booking-photo.service tests.
// Bugs 36, 37, 461, 1224 — server stores S3 URLs, never file:// URIs.

const dbQueryMock = jest.fn();

jest.mock('../../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: jest.fn(),
  },
}));

const validateFileMock = jest.fn();
const saveUploadedFileMock = jest.fn();
const deleteUploadedFileMock = jest.fn();

jest.mock('../../src/services/upload.service', () => ({
  validateFile: (...args: unknown[]) => validateFileMock(...args),
  saveUploadedFile: (...args: unknown[]) => saveUploadedFileMock(...args),
  deleteUploadedFile: (...args: unknown[]) => deleteUploadedFileMock(...args),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import * as svc from '../../src/services/booking-photo.service';

const BOOKING_ID = '11111111-1111-1111-1111-111111111111';
const CUSTOMER_ID = '22222222-2222-2222-2222-222222222222';
const PROVIDER_USER_ID = '33333333-3333-3333-3333-333333333333';
const ADMIN_ID = '44444444-4444-4444-4444-444444444444';

beforeEach(() => {
  dbQueryMock.mockReset();
  validateFileMock.mockReset();
  saveUploadedFileMock.mockReset();
  deleteUploadedFileMock.mockReset();
  // Default deleteUploadedFile returns a resolved promise so the
  // .catch chain in the service doesn't crash on undefined.
  deleteUploadedFileMock.mockResolvedValue(undefined);
});

describe('isPhotoType', () => {
  it.each(['before', 'during', 'after', 'issue', 'checklist', 'identity', 'portfolio'])(
    'accepts %s',
    (v) => expect(svc.isPhotoType(v)).toBe(true),
  );
  it.each(['', 'random', null, undefined, 7, {}, 'file://photo.jpg'])(
    'rejects %p',
    (v) => expect(svc.isPhotoType(v)).toBe(false),
  );
});

describe('isSignatureType', () => {
  it.each(['ic_agreement', 'customer_acceptance', 'work_authorization', 'change_order_accept'])(
    'accepts %s',
    (v) => expect(svc.isSignatureType(v)).toBe(true),
  );
  it.each(['', 'signature', null, 'fake'])(
    'rejects %p',
    (v) => expect(svc.isSignatureType(v)).toBe(false),
  );
});

describe('uploadBookingPhoto — Bug 36 + 461 + 1224', () => {
  const buf = Buffer.from('fake-jpeg');

  function setupHappyPath() {
    // Booking lookup: customer is the actor.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: BOOKING_ID, customer_id: CUSTOMER_ID, provider_user_id: PROVIDER_USER_ID }],
      rowCount: 1,
    });
    saveUploadedFileMock.mockResolvedValue({
      id: 'file-1',
      url: 'https://onservice-bucket.s3.ap-southeast-1.amazonaws.com/bookings/X/photos/Y.jpg',
      filename: 'bookings/X/photos/Y.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: buf.length,
    });
    // INSERT INTO booking_photos returning row.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'photo-1', uploaded_at: new Date('2026-04-30T12:00:00Z') }],
      rowCount: 1,
    });
  }

  it('uploads + persists DB row + returns S3 URL (NEVER file://)', async () => {
    setupHappyPath();
    const result = await svc.uploadBookingPhoto({
      bookingId: BOOKING_ID,
      uploadedByUserId: CUSTOMER_ID,
      uploadedByRole: 'customer',
      photoType: 'after',
      buffer: buf,
      originalname: 'photo.jpg',
      mimetype: 'image/jpeg',
    });

    expect(result.id).toBe('photo-1');
    expect(result.storageUrl).not.toMatch(/^file:\/\//);
    expect(result.storageUrl).toMatch(/^https:\/\/.+\.s3.+\.amazonaws\.com/);
    expect(result.photoType).toBe('after');

    expect(validateFileMock).toHaveBeenCalledWith('photo.jpg', 'image/jpeg', buf.length);
    expect(saveUploadedFileMock).toHaveBeenCalledTimes(1);

    // INSERT used storage_key (not file://) + photo_type from input.
    const insertCall = dbQueryMock.mock.calls.find((c) => /INSERT INTO booking_photos/.test(c[0]));
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toEqual([
      BOOKING_ID,
      CUSTOMER_ID,
      'customer',
      'after',
      'bookings/X/photos/Y.jpg',
      'https://onservice-bucket.s3.ap-southeast-1.amazonaws.com/bookings/X/photos/Y.jpg',
      buf.length,
      'image/jpeg',
    ]);
  });

  it('rejects 403 when uploader is not a party to the booking', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: BOOKING_ID, customer_id: CUSTOMER_ID, provider_user_id: PROVIDER_USER_ID }],
      rowCount: 1,
    });

    await expect(
      svc.uploadBookingPhoto({
        bookingId: BOOKING_ID,
        uploadedByUserId: 'someone-else',
        uploadedByRole: 'customer',
        photoType: 'after',
        buffer: buf,
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(saveUploadedFileMock).not.toHaveBeenCalled();
  });

  it('rejects 403 when claimed role does not match resolved booking role', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: BOOKING_ID, customer_id: CUSTOMER_ID, provider_user_id: PROVIDER_USER_ID }],
      rowCount: 1,
    });

    await expect(
      svc.uploadBookingPhoto({
        bookingId: BOOKING_ID,
        uploadedByUserId: CUSTOMER_ID,
        uploadedByRole: 'provider',  // claims provider but is the customer
        photoType: 'after',
        buffer: buf,
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('admin role bypasses booking-party check', async () => {
    saveUploadedFileMock.mockResolvedValue({
      id: 'file-2',
      url: 'https://onservice.s3/bookings/X/photos/Z.jpg',
      filename: 'bookings/X/photos/Z.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: buf.length,
    });
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'photo-2', uploaded_at: new Date() }],
      rowCount: 1,
    });

    const result = await svc.uploadBookingPhoto({
      bookingId: BOOKING_ID,
      uploadedByUserId: ADMIN_ID,
      uploadedByRole: 'admin',
      photoType: 'issue',
      buffer: buf,
      originalname: 'photo.jpg',
      mimetype: 'image/jpeg',
    });

    expect(result.id).toBe('photo-2');
    // Booking SELECT should NOT have been called for admin.
    const bookingSelect = dbQueryMock.mock.calls.find((c) => /FROM bookings b/.test(c[0]));
    expect(bookingSelect).toBeUndefined();
  });

  it('rejects invalid photoType with 400', async () => {
    await expect(
      svc.uploadBookingPhoto({
        bookingId: BOOKING_ID,
        uploadedByUserId: CUSTOMER_ID,
        uploadedByRole: 'customer',
        photoType: 'malicious' as svc.PhotoType,
        buffer: buf,
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('cleans up S3 file when DB insert returns no row', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: BOOKING_ID, customer_id: CUSTOMER_ID, provider_user_id: PROVIDER_USER_ID }],
      rowCount: 1,
    });
    saveUploadedFileMock.mockResolvedValue({
      id: 'file-3',
      url: 'https://x/file.jpg',
      filename: 'context/u/file.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 100,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(
      svc.uploadBookingPhoto({
        bookingId: BOOKING_ID,
        uploadedByUserId: CUSTOMER_ID,
        uploadedByRole: 'customer',
        photoType: 'after',
        buffer: buf,
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
      }),
    ).rejects.toMatchObject({ statusCode: 500 });

    expect(deleteUploadedFileMock).toHaveBeenCalledWith('context/u/file.jpg');
  });
});

describe('listBookingPhotos + countAfterPhotos — Bug 1220', () => {
  it('lists photos filtered by photoType', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'p1',
          booking_id: BOOKING_ID,
          photo_type: 'after',
          storage_url: 'https://x/1.jpg',
          storage_key: 'k1',
          uploaded_by: PROVIDER_USER_ID,
          uploaded_by_role: 'provider',
          uploaded_at: new Date('2026-04-30T10:00:00Z'),
        },
      ],
      rowCount: 1,
    });

    const result = await svc.listBookingPhotos(BOOKING_ID, { photoType: 'after' });
    expect(result).toHaveLength(1);
    expect(result[0]!.storageUrl).not.toMatch(/^file:\/\//);
    expect(result[0]!.photoType).toBe('after');
  });

  it('countAfterPhotos returns numeric count for Bug 1220 enforcement', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 });
    const count = await svc.countAfterPhotos(BOOKING_ID);
    expect(count).toBe(3);
  });
});

describe('uploadSignature — Bug 37', () => {
  const buf = Buffer.from('PNG-bitmap');

  it('rejects ic_agreement with non-null bookingId', async () => {
    await expect(
      svc.uploadSignature({
        bookingId: BOOKING_ID,
        signedByUserId: PROVIDER_USER_ID,
        signedRole: 'provider',
        signatureType: 'ic_agreement',
        buffer: buf,
        originalname: 'sig.png',
        mimetype: 'image/png',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects ic_agreement signed by non-provider', async () => {
    await expect(
      svc.uploadSignature({
        bookingId: null,
        signedByUserId: CUSTOMER_ID,
        signedRole: 'customer',
        signatureType: 'ic_agreement',
        buffer: buf,
        originalname: 'sig.png',
        mimetype: 'image/png',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('uploads ic_agreement + persists DB row with storage_key', async () => {
    saveUploadedFileMock.mockResolvedValue({
      id: 'sig-file',
      url: 'https://onservice.s3/signatures/ic_agreement/X.png',
      filename: 'signatures/ic_agreement/X.png',
      mimeType: 'image/png',
      sizeBytes: buf.length,
    });
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'sig-1', signed_at: new Date('2026-04-30T11:00:00Z') }],
      rowCount: 1,
    });

    const result = await svc.uploadSignature({
      bookingId: null,
      signedByUserId: PROVIDER_USER_ID,
      signedRole: 'provider',
      signatureType: 'ic_agreement',
      buffer: buf,
      originalname: 'sig.png',
      mimetype: 'image/png',
      fullNameTyped: 'Juan dela Cruz',
      ipAddress: '203.0.113.5',
      userAgent: 'OnServicePH/1.0 (iOS)',
    });

    expect(result.id).toBe('sig-1');
    expect(result.storageUrl).not.toMatch(/^file:\/\//);
    expect(result.signatureType).toBe('ic_agreement');
    expect(result.bookingId).toBeNull();

    const insertCall = dbQueryMock.mock.calls.find((c) => /INSERT INTO booking_signatures/.test(c[0]));
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toEqual([
      null,
      PROVIDER_USER_ID,
      'provider',
      'ic_agreement',
      'signatures/ic_agreement/X.png',
      'https://onservice.s3/signatures/ic_agreement/X.png',
      'Juan dela Cruz',
      '203.0.113.5',
      'OnServicePH/1.0 (iOS)',
    ]);
  });

  it('rejects customer_acceptance with null bookingId', async () => {
    await expect(
      svc.uploadSignature({
        bookingId: null,
        signedByUserId: CUSTOMER_ID,
        signedRole: 'customer',
        signatureType: 'customer_acceptance',
        buffer: buf,
        originalname: 'sig.png',
        mimetype: 'image/png',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects 403 when customer_acceptance signer is not booking customer', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: BOOKING_ID, customer_id: CUSTOMER_ID, provider_user_id: PROVIDER_USER_ID }],
      rowCount: 1,
    });

    await expect(
      svc.uploadSignature({
        bookingId: BOOKING_ID,
        signedByUserId: 'imposter',
        signedRole: 'customer',
        signatureType: 'customer_acceptance',
        buffer: buf,
        originalname: 'sig.png',
        mimetype: 'image/png',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
