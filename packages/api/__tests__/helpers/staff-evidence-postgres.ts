// S1-10 (SEC-094) helpers: the real job-evidence writers on the guarded staff
// fixture. In withStaffJobListDatabase an approved team member of provider B
// is recorded as the performer on both bookings: booking A belongs to
// provider B (the team member's own job) and booking B has no provider. The
// checklist and photo/signature tables are the exact DDL of migrations 078
// and 079. File storage is replaced by a spy, so no file is written.
import fs from 'fs';
import path from 'path';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Pool } from 'pg';
import checklistRouter from '../../src/routes/checklist.routes';
import uploadRouter from '../../src/routes/upload.routes';
import bookingRouter from '../../src/routes/booking.routes';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { withStaffJobListDatabase, bookingA, bookingB, syntheticSecret } from './booking-participant-postgres';

export interface StaffEvidenceFixture {
  staffUserId: string;
  staffId: string;
  // A checklist item already on each booking, for the toggle writer.
  itemOnA: string;
  itemOnB: string;
}

export async function withStaffEvidenceDatabase(
  run: (database: Pool, fixture: StaffEvidenceFixture) => Promise<void>,
): Promise<void> {
  await withStaffJobListDatabase(async (database, staffUserId, staffId) => {
    // Migration 078 seeds templates by category slug; the fixture's
    // categories have none, so its seed inserts nothing.
    await database.query('ALTER TABLE service_categories ADD COLUMN slug text');
    for (const migration of ['078_d07_checklist_templates.sql', '079_d07_booking_photos_signatures.sql']) {
      await database.query(fs.readFileSync(path.join(__dirname, '../../migrations', migration), 'utf8'));
    }
    // The legacy provider photo writer appends to these booking columns.
    // (Migration 037's shape: nullable, defaulting to empty.)
    await database.query(`ALTER TABLE bookings ADD COLUMN provider_before_photos text[] DEFAULT '{}',
      ADD COLUMN provider_after_photos text[] DEFAULT '{}'`);
    const categoryId = (await database.query<{ category_id: string }>('SELECT category_id FROM bookings WHERE id=$1', [bookingA]))
      .rows[0]!.category_id;
    const template = (await database.query<{ id: string }>(
      'INSERT INTO checklist_templates(category_id) VALUES ($1) RETURNING id', [categoryId])).rows[0]!.id;
    const section = (await database.query<{ id: string }>(`INSERT INTO checklist_template_sections(template_id,display_order,title)
      VALUES ($1,1,'Synthetic section') RETURNING id`, [template])).rows[0]!.id;
    const templateItem = (await database.query<{ id: string }>(`INSERT INTO checklist_template_items(section_id,display_order,title)
      VALUES ($1,1,'Synthetic step') RETURNING id`, [section])).rows[0]!.id;
    const items: string[] = [];
    for (const bookingId of [bookingA, bookingB]) {
      const checklist = (await database.query<{ id: string }>(`INSERT INTO booking_checklists(booking_id,template_id,template_version)
        VALUES ($1,$2,1) RETURNING id`, [bookingId, template])).rows[0]!.id;
      items.push((await database.query<{ id: string }>(`INSERT INTO booking_checklist_items
          (booking_checklist_id,template_item_id,title_snapshot,photo_required)
        VALUES ($1,$2,'Synthetic step',FALSE) RETURNING id`, [checklist, templateItem])).rows[0]!.id);
    }
    await run(database, { staffUserId, staffId, itemOnA: items[0]!, itemOnB: items[1]! });
  });
}

export async function evidenceSnapshot(database: Pool) {
  return {
    checklists: (await database.query('SELECT * FROM booking_checklists ORDER BY id')).rows,
    items: (await database.query('SELECT * FROM booking_checklist_items ORDER BY id')).rows,
    photos: (await database.query('SELECT * FROM booking_photos ORDER BY id')).rows,
    signatures: (await database.query('SELECT * FROM booking_signatures ORDER BY id')).rows,
    legacyPhotos: (await database.query(`SELECT id, provider_before_photos, provider_after_photos
      FROM bookings ORDER BY id`)).rows,
  };
}

// A tiny real JPEG header is enough: storage and file validation are spied.
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

export function evidenceHttp(userId: string, role: string) {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/v1/uploads', uploadRouter);
  app.use('/api/v1/bookings', bookingRouter);
  app.use('/api/v1', checklistRouter);
  app.use(errorMiddleware);
  const token = jwt.sign({ userId, role, sessionVersion: 1, type: 'access' }, syntheticSecret, { expiresIn: '5m' });
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  return {
    openChecklist: (bookingId: string) => auth(request(app).get(`/api/v1/jobs/${bookingId}/checklist`)),
    tickItem: (bookingId: string, itemId: string) => auth(request(app)
      .patch(`/api/v1/jobs/${bookingId}/checklist/items/${itemId}`)).send({ completed: true, notes: 'Synthetic note' }),
    uploadPhoto: (bookingId: string) => auth(request(app).post('/api/v1/uploads/booking-photo'))
      .field('bookingId', bookingId).field('photoType', 'before')
      .attach('photo', jpeg, { filename: 'before.jpg', contentType: 'image/jpeg' }),
    legacyPhotos: (bookingId: string) => auth(request(app).post(`/api/v1/bookings/${bookingId}/photos`))
      .send({ phase: 'before', urls: ['https://storage.example.test/bookings/synthetic-before.jpg'] }),
    uploadSignature: (bookingId: string) => auth(request(app).post('/api/v1/uploads/booking-signature'))
      .field('bookingId', bookingId).field('signatureType', 'customer_acceptance')
      .attach('signature', jpeg, { filename: 'signature.png', contentType: 'image/png' }),
  };
}

export { bookingA, bookingB };
