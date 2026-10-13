// HA-M2 (D38 Milestone 2, package P3) helpers: private job media on the
// guarded PostgreSQL fixture, with the real job-media router behind the real
// authentication middleware and a throwaway uploads volume.
//
// Built on withRequestEngineDatabase (Milestone 1 job requests + the REAL
// migrations 183 and 184, so job_media, its CHECKs and the job_media_viewed
// admin action are the production ones). On top it applies the real 131
// (provider_staff and bookings.performer_staff_id) and 156 (the users role
// list with dpo and provider_staff) and seeds the extra
// accounts the viewer rule needs: an admin, a DPO and an approved staff
// member of provider A. Files go to a fresh temporary UPLOAD_DIR that is
// removed afterwards; links are signed with a synthetic export secret.
//
// Provider A covers the fixture's Cebu category within its radius, so it can
// see a quote request as a lead. Provider B has no coordinates and no
// services, so it cannot.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Pool } from 'pg';
import jobMediaRouter from '../../src/routes/job-media.routes';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { db } from '../../src/models/db';
import * as jobMediaService from '../../src/services/job-media.service';
import { readMigration, withRequestEngineDatabase } from './request-engine-postgres';
import { cebuPin, requestCategory } from './job-request-postgres';
import { customerA, providerA, syntheticSecret } from './booking-participant-postgres';

export const adminUser = '41000000-0000-4000-8000-000000000001';
export const dpoUser = '42000000-0000-4000-8000-000000000001';
export const staffUser = '72000000-0000-4000-8000-000000000001';
export const staffMember = '72100000-0000-4000-8000-000000000001';
export const syntheticExportSecret = 'job-media-synthetic-export-secret-0123456789abcdef';
export const CHUNK = 2 * 1024 * 1024;

export interface JobMediaFixture {
  database: Pool;
  uploadDir: string;
}

export async function withJobMediaDatabase(run: (fixture: JobMediaFixture) => Promise<void>): Promise<void> {
  const saved = {
    uploadDir: process.env.UPLOAD_DIR,
    secret: process.env.DATA_EXPORT_DOWNLOAD_SECRET,
  };
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onservice-job-media-'));
  process.env.UPLOAD_DIR = uploadDir;
  process.env.DATA_EXPORT_DOWNLOAD_SECRET = syntheticExportSecret;
  jobMediaService.__clearViewerCacheForTest();
  try {
    await withRequestEngineDatabase(async database => {
      await database.query('CREATE TABLE IF NOT EXISTS reviews (id uuid PRIMARY KEY DEFAULT gen_random_uuid())');
      // 131 adds provider_staff (and a users role CHECK that dropped dpo);
      // 156 restores the composed role list, as on live.
      await database.query(readMigration('131_provider_staff.sql'));
      await database.query(readMigration('156_restore_dpo_provider_staff_user_roles.sql'));
      await database.query(`INSERT INTO users (id, role, first_name, last_name) VALUES
          ($1, 'admin', 'Synthetic', 'Admin'), ($2, 'dpo', 'Synthetic', 'Officer'),
          ($3, 'provider_staff', 'Synthetic', 'Staff')`, [adminUser, dpoUser, staffUser]);
      await database.query(`INSERT INTO provider_staff (id, provider_id, user_id, status)
          VALUES ($1, $2, $3, 'approved')`, [staffMember, providerA, staffUser]);
      await database.query(`UPDATE users SET first_name = 'Synthetic', last_name = 'Person'
          WHERE first_name IS NULL`);
      await run({ database, uploadDir });
    });
  } finally {
    jobMediaService.__clearViewerCacheForTest();
    if (saved.uploadDir === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = saved.uploadDir;
    if (saved.secret === undefined) delete process.env.DATA_EXPORT_DOWNLOAD_SECRET;
    else process.env.DATA_EXPORT_DOWNLOAD_SECRET = saved.secret;
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
}

/** The job-media router mounted as server.ts mounts it, behind the real auth middleware. */
export function jobMediaApp(): express.Express {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/v1/job-media', jobMediaRouter);
  app.use(errorMiddleware);
  return app;
}

export function bearer(userId: string, role: string): string {
  return `Bearer ${jwt.sign({ userId, role, sessionVersion: 1, type: 'access' }, syntheticSecret, { expiresIn: '10m' })}`;
}

/** HTTP calls as one signed-in user. */
export function mediaHttp(userId: string, role: string) {
  const app = jobMediaApp();
  const auth = bearer(userId, role);
  return {
    app,
    start: (body: Record<string, unknown>) => request(app).post('/api/v1/job-media').set('Authorization', auth).send(body),
    chunk: (id: string, index: number, bytes: Buffer) => request(app)
      .put(`/api/v1/job-media/${id}/chunks/${index}`).set('Authorization', auth)
      .set('Content-Type', 'application/octet-stream').send(bytes),
    complete: (id: string) => request(app).post(`/api/v1/job-media/${id}/complete`).set('Authorization', auth),
    state: (id: string) => request(app).get(`/api/v1/job-media/${id}`).set('Authorization', auth),
    remove: (id: string) => request(app).delete(`/api/v1/job-media/${id}`).set('Authorization', auth),
    url: (id: string) => request(app).get(`/api/v1/job-media/${id}/url`).set('Authorization', auth),
    booking: (bookingId: string) => request(app).get(`/api/v1/job-media/booking/${bookingId}`).set('Authorization', auth),
  };
}

/** GET (or HEAD) a signed link with no sign-in, as a browser or player would. */
export function fetchSigned(url: string, method: 'GET' | 'HEAD' = 'GET', range?: string) {
  const call = method === 'HEAD' ? request(jobMediaApp()).head(url) : request(jobMediaApp()).get(url);
  const withRange = range ? call.set('Range', range) : call;
  return withRange.buffer(true).parse((response, done) => {
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));
    response.on('end', () => done(null, Buffer.concat(chunks)));
  });
}

export interface UploadOptions {
  kind: 'photo' | 'video' | 'voice';
  mime: string;
  bytes: Buffer;
  durationMs?: number;
  purpose?: 'job_request' | 'chat';
  conversationId?: string;
}

/** Start, send every chunk and complete; returns the complete response. */
export async function uploadThroughApi(http: ReturnType<typeof mediaHttp>, options: UploadOptions) {
  const started = await http.start({
    purpose: options.purpose ?? 'job_request',
    ...(options.conversationId ? { conversationId: options.conversationId } : {}),
    kind: options.kind,
    mime: options.mime,
    totalBytes: options.bytes.length,
    clientUploadId: crypto.randomUUID(),
    ...(options.durationMs === undefined ? {} : { durationMs: options.durationMs }),
  });
  if (started.status !== 201) throw new Error(`start failed: ${started.status} ${JSON.stringify(started.body)}`);
  const id = started.body.data.id as string;
  for (let index = 0; index * CHUNK < options.bytes.length; index += 1) {
    const sent = await http.chunk(id, index, options.bytes.subarray(index * CHUNK, (index + 1) * CHUNK));
    if (sent.status !== 200) throw new Error(`chunk ${index} failed: ${sent.status} ${JSON.stringify(sent.body)}`);
  }
  const completed = await http.complete(id);
  return { id, completed };
}

/** A small, valid JPEG (with GPS in its EXIF) and optional padding in the scan data. */
export function syntheticJpeg(options: { scanBytes?: number; orientation?: number } = {}): Buffer {
  const segment = (marker: number, body: Buffer): Buffer => {
    const header = Buffer.from([0xff, marker, 0, 0]);
    header.writeUInt16BE(body.length + 2, 2);
    return Buffer.concat([header, body]);
  };
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.from('JFIF\0synthetic', 'latin1')),
    segment(0xe1, exifWithGps(options.orientation ?? 6)),
    segment(0xdb, Buffer.from('quant-table', 'latin1')),
    segment(0xda, Buffer.from('scan-header', 'latin1')),
    Buffer.alloc(options.scanBytes ?? 512, 0x5a),
    Buffer.from([0xff, 0xd9]),
  ]);
}

export const GPS_MARKER = 'GPS-LATITUDE-10.3157-N';

/**
 * EXIF payload ("Exif\0\0" + big-endian TIFF): IFD0 with Orientation and a
 * GPS IFD pointer; the GPS IFD holds a latitude reference and an ASCII value
 * carrying GPS_MARKER so a test can see whether it survived.
 */
export function exifWithGps(orientation: number): Buffer {
  const marker = Buffer.from(`${GPS_MARKER}\0`, 'latin1');
  // Layout (offsets from the TIFF start): header 0-7, IFD0 at 8 (2 entries),
  // GPS IFD at 38 (1 entry), marker string at 56.
  const tiff = Buffer.alloc(56 + marker.length);
  tiff.write('MM', 0, 'latin1');
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(2, 8);
  // Orientation SHORT
  tiff.writeUInt16BE(0x0112, 10); tiff.writeUInt16BE(3, 12); tiff.writeUInt32BE(1, 14); tiff.writeUInt16BE(orientation, 18);
  // GPS IFD pointer LONG
  tiff.writeUInt16BE(0x8825, 22); tiff.writeUInt16BE(4, 24); tiff.writeUInt32BE(1, 26); tiff.writeUInt32BE(38, 30);
  tiff.writeUInt32BE(0, 34); // no IFD1
  tiff.writeUInt16BE(1, 38);
  // GPSLatitude as ASCII text pointing at the marker (synthetic, readable in a hex dump)
  tiff.writeUInt16BE(0x0002, 40); tiff.writeUInt16BE(2, 42); tiff.writeUInt32BE(marker.length, 44); tiff.writeUInt32BE(56, 48);
  tiff.writeUInt32BE(0, 52);
  marker.copy(tiff, 56);
  return Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
}

/** A quote request by customer A in the fixture's Cebu area (provider A can see it as a lead). */
export async function createQuoteRequest(database: Pool, customerId = customerA): Promise<string> {
  const result = await database.query<{ id: string }>(`INSERT INTO bookings
      (customer_id, booking_type, status, category_id, latitude, longitude, city, barangay, province,
       address, description, urgency)
    VALUES ($1, 'quote_based', 'requested', $2, $3, $4, 'Cebu City', 'Kamputhaw', 'Cebu',
            '22 Mango Avenue', 'The bedroom aircon drips water onto the floor.', 'within_3_days')
    RETURNING id`, [customerId, requestCategory, cebuPin.latitude, cebuPin.longitude]);
  return result.rows[0]!.id;
}

/** Attach stored request media to a booking exactly as createJobRequest will (package P2). */
export async function attachRequestMedia(ownerUserId: string, bookingId: string, mediaIds: string[]): Promise<void> {
  await db.transaction(async client => {
    await jobMediaService.lockAttachableMediaInTransaction(client, ownerUserId, mediaIds);
    await jobMediaService.attachMediaInTransaction(client, bookingId, mediaIds);
  });
}

/** A live quote from a provider on a request. */
export async function submitQuote(database: Pool, bookingId: string, providerId: string): Promise<string> {
  const result = await database.query<{ id: string }>(`INSERT INTO booking_quotes
      (booking_id, provider_id, quoted_price, description, expires_at, status)
    VALUES ($1, $2, 150000, 'Clean and re-seal the drain line.', NOW() + INTERVAL '2 days', 'submitted')
    RETURNING id`, [bookingId, providerId]);
  return result.rows[0]!.id;
}

/** Customer decline as migration 183 records it (reason + declined_at). */
export async function declineQuote(database: Pool, quoteId: string): Promise<void> {
  await database.query(`UPDATE booking_quotes SET status = 'declined', decline_reason = 'too_expensive',
      declined_at = NOW(), updated_at = NOW() WHERE id = $1`, [quoteId]);
}

/** A request thread between the customer and a provider's user (columns as of migration 006/138). */
export async function createConversation(database: Pool, bookingId: string, customerId: string, providerUserId: string): Promise<string> {
  const result = await database.query<{ id: string }>(`INSERT INTO conversations (booking_id, customer_id, provider_id)
    VALUES ($1, $2, $3) RETURNING id`, [bookingId, customerId, providerUserId]);
  return result.rows[0]!.id;
}

export function storePath(uploadDir: string, storageKey: string): string {
  return path.join(uploadDir, ...storageKey.split('/'));
}

export function tempDir(uploadDir: string): string {
  return path.join(uploadDir, 'private-artifacts', 'job-media-tmp');
}
