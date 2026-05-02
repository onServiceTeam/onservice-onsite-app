// MED-N08 + MED-N09 fix verified.
//
// MED-N09: getBookingEvidence read only the legacy `booking_images`
// table. Photos uploaded via the post-D07 flow live in
// `booking_photos` (migration 079) and were INVISIBLE to admin
// evidence review. Now: UNION ALL across both tables with
// normalized columns + soft-delete filter on the new table.
//
// MED-N08: pre-fix had two `to_regclass` defensive lookups for
// `gps_checkins` and `receipts` tables that don't exist in any
// migration. Dead code removed; the function still returns empty
// arrays for those fields so the BookingEvidence shape stays
// stable for admin UI consumers.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SVC = readFileSync(
  resolve(__dirname, '../src/services/booking-admin.service.ts'),
  'utf8',
);

describe('MED-N09 — getBookingEvidence reads from BOTH photo tables', () => {
  it('queries the legacy booking_images table', () => {
    expect(SVC).toMatch(/FROM booking_images\s*\n\s*WHERE booking_id = \$1/);
  });

  it('also queries the new booking_photos table', () => {
    expect(SVC).toMatch(/FROM booking_photos\s*\n\s*WHERE booking_id = \$1 AND deleted_at IS NULL/);
  });

  it('uses UNION ALL to merge the two sources', () => {
    expect(SVC).toMatch(/FROM booking_images[\s\S]{0,200}UNION ALL[\s\S]{0,200}FROM booking_photos/);
  });

  it('normalizes column names so the merge is shape-compatible', () => {
    // booking_images uses image_url + image_type; booking_photos uses
    // storage_url/storage_key + photo_type. Both AS'd to photo_url +
    // photo_type so the result rows merge cleanly.
    expect(SVC).toMatch(/image_url AS photo_url, image_type AS photo_type/);
    expect(SVC).toMatch(/COALESCE\(storage_url, storage_key\) AS photo_url, photo_type/);
  });

  it('orders the merged rows by created_at across both tables', () => {
    expect(SVC).toMatch(/UNION ALL[\s\S]*?ORDER BY created_at ASC/);
  });

  it('respects soft-delete on booking_photos (deleted_at IS NULL)', () => {
    expect(SVC).toMatch(/booking_photos[\s\S]{0,80}deleted_at IS NULL/);
  });
});

describe('MED-N08 — dead-code lookup of gps_checkins + receipts removed', () => {
  it('no longer references gps_checkins anywhere in the function', () => {
    const block = SVC.match(/getBookingEvidence[\s\S]*?return \{ photos, chatMessageCount, gpsCheckIns, receipts \};/);
    expect(block).not.toBeNull();
    expect(block![0]).not.toMatch(/to_regclass\('public\.gps_checkins'\)/);
    expect(block![0]).not.toMatch(/FROM gps_checkins/);
  });

  it('no longer references receipts table anywhere in the function', () => {
    const block = SVC.match(/getBookingEvidence[\s\S]*?return \{ photos, chatMessageCount, gpsCheckIns, receipts \};/);
    expect(block).not.toBeNull();
    expect(block![0]).not.toMatch(/to_regclass\('public\.receipts'\)/);
    expect(block![0]).not.toMatch(/FROM receipts/);
  });

  it('still returns empty gpsCheckIns + receipts arrays for shape compatibility', () => {
    expect(SVC).toMatch(/const gpsCheckIns: BookingEvidence\['gpsCheckIns'\] = \[\]/);
    expect(SVC).toMatch(/const receipts: BookingEvidence\['receipts'\] = \[\]/);
  });

  it('comment documents the MED-N08 rationale', () => {
    expect(SVC).toMatch(/MED-N08 fix.*?gps_checkins/s);
  });
});
