import { Readable } from 'node:stream';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const dbQuery = jest.fn();
const profileRead = jest.fn();
const noteRead = jest.fn();
const contactReveal = jest.fn();
const certificateRead = jest.fn();
const objectRead = jest.fn();
const presign = jest.fn();

jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => dbQuery(...args) } }));
jest.mock('../src/services/provider-admin.service', () => ({
  getProviderProfile: (...args: unknown[]) => profileRead(...args),
  listProviderNotes: (...args: unknown[]) => noteRead(...args),
  revealProviderContact: (...args: unknown[]) => contactReveal(...args),
  getProviderCertificationDocumentStream: (...args: unknown[]) => certificateRead(...args),
}));
jest.mock('../src/services/upload.service', () => ({
  ...jest.requireActual('../src/services/upload.service'),
  getObjectStream: (...args: unknown[]) => objectRead(...args),
  getKycPresignedUrl: (...args: unknown[]) => presign(...args),
}));

import providerAdminRouter from '../src/routes/provider-admin.routes';
import providerRouter from '../src/routes/provider.routes';
import { createAppError, errorMiddleware } from '../src/middleware/error.middleware';

const providerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ownerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const reviewerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const certificateId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const syntheticSecret = 'provider-cache-fixture-only-not-a-real-credential';
const privateKey = `onboarding/${ownerId}/nbi.jpg`;
const signedLink = { url: 'https://storage.example.invalid/nbi?signature=synthetic-only', expiresInSeconds: 120 };
const documentBytes = Buffer.from('synthetic private document, not a real ID');
const documentStream = () => ({ body: Readable.from(documentBytes), contentType: 'image/jpeg', contentLength: documentBytes.length });
let canonicalRole = 'super_admin';
let canonicalVersion = 1;
let mustRotatePassword = false;
let previousSecret: string | undefined;

function credential(role = canonicalRole, userId = reviewerId): string {
  return jwt.sign({ userId, role, sessionVersion: 1, type: 'access' }, syntheticSecret, { expiresIn: '5m' });
}

function app() {
  const server = express();
  server.use(express.json());
  server.use(cookieParser());
  server.use('/api/v1/admin/providers', providerAdminRouter);
  server.use('/api/v1/providers', providerRouter);
  server.get('/public-catalog-fixture', (_req, res) => res.set('Cache-Control', 'public, max-age=60').json({ categories: [] }));
  server.use(errorMiddleware);
  return server;
}

beforeEach(() => {
  previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = syntheticSecret;
  jest.clearAllMocks();
  canonicalRole = 'super_admin';
  canonicalVersion = 1;
  mustRotatePassword = false;
  // JWT verification, session checks, mounted routers, KYC authorization and
  // HTTP bytes are real. Account/document lookups, storage and the separate
  // profile/note/contact/certificate service responses are synthetic fixtures.
  dbQuery.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes('COALESCE(must_rotate_password')) {
      return { rows: [{ role: canonicalRole, is_active: true, session_version: canonicalVersion, must_rotate_password: mustRotatePassword }] };
    }
    if (sql === 'SELECT id FROM providers WHERE user_id = $1') {
      return { rows: params[0] === ownerId ? [{ id: providerId }] : [] };
    }
    if (sql.includes('government_id_front_url') && sql.includes('FROM providers WHERE id = $1')) {
      return { rows: params[0] === providerId ? [{ id: providerId, user_id: ownerId,
        government_id_front_url: privateKey, government_id_back_url: privateKey,
        selfie_url: privateKey, nbi_clearance_url: privateKey }] : [] };
    }
    throw new Error('Unexpected query in provider cache fixture.');
  });
  presign.mockResolvedValue(signedLink.url);
  objectRead.mockImplementation(async () => documentStream());
  certificateRead.mockImplementation(async () => documentStream());
  profileRead.mockResolvedValue({ id: providerId, vettingAnswers: { fullAddress: 'Synthetic private address' } });
  noteRead.mockResolvedValue([{ body: 'Synthetic support note, no real person.' }]);
  contactReveal.mockResolvedValue({ phone: '+639170000000', email: 'synthetic@example.invalid' });
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});

it('Bug SEC-074 — private provider review responses forbid storage for signed links as well as document streams', async () => {
  const server = app();
  const adminLink = await request(server).get(`/api/v1/admin/providers/${providerId}/kyc/nbi_clearance?mode=link`)
    .set('Cookie', `admin_session=${credential()}`);
  expect(adminLink.status).toBe(200);
  expect(adminLink.body).toEqual({ success: true, data: signedLink });
  expect(presign).toHaveBeenCalledWith(privateKey, 120);
  expect(objectRead).not.toHaveBeenCalled();

  canonicalRole = 'provider';
  const ownerLink = await request(server).get('/api/v1/providers/me/kyc/nbi_clearance?mode=link')
    .auth(credential('provider', ownerId), { type: 'bearer' });
  expect(ownerLink.status).toBe(200);
  expect(ownerLink.body).toEqual({ success: true, data: signedLink });
  const ownerStream = await request(server).get('/api/v1/providers/me/kyc/nbi_clearance')
    .auth(credential('provider', ownerId), { type: 'bearer' });
  expect(ownerStream.status).toBe(200);
  expect(ownerStream.body).toEqual(documentBytes);
  expect(ownerStream.headers['content-type']).toMatch(/^image\/jpeg/);

  canonicalRole = 'admin';
  presign.mockResolvedValueOnce(null);
  const fallback = await request(server).get(`/api/v1/admin/providers/${providerId}/kyc/nbi_clearance?mode=link`)
    .auth(credential(), { type: 'bearer' });
  expect(fallback.status).toBe(200);
  expect(fallback.body).toEqual(documentBytes);
  expect(objectRead).toHaveBeenLastCalledWith(privateKey);
  expect([adminLink, ownerLink, ownerStream, fallback].map(response => response.headers['cache-control']))
    .toEqual(Array(4).fill('private, no-store'));
});

it('keeps profile, support notes, revealed contact and certificate responses private without changing their data', async () => {
  const server = app();
  const bearer = credential();
  const profile = await request(server).get(`/api/v1/admin/providers/${providerId}/profile`).auth(bearer, { type: 'bearer' });
  const notes = await request(server).get(`/api/v1/admin/providers/${providerId}/notes`).auth(bearer, { type: 'bearer' });
  const contact = await request(server).post(`/api/v1/admin/providers/${providerId}/reveal-contact`).auth(bearer, { type: 'bearer' });
  const certificate = await request(server).get(`/api/v1/admin/providers/${providerId}/certifications/${certificateId}/document`).auth(bearer, { type: 'bearer' });
  for (const response of [profile, notes, contact, certificate]) {
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
  }
  expect(profile.body.data.vettingAnswers.fullAddress).toBe('Synthetic private address');
  expect(notes.body.data).toEqual([{ body: 'Synthetic support note, no real person.' }]);
  expect(contact.body.data.email).toBe('synthetic@example.invalid');
  expect(certificate.body).toEqual(documentBytes);
  expect(profileRead).toHaveBeenCalledWith(providerId, 'super_admin');
  expect(contactReveal).toHaveBeenCalledWith(providerId, reviewerId);
  const catalog = await request(server).get('/public-catalog-fixture');
  expect(catalog.status).toBe(200);
  expect(catalog.headers['cache-control']).toBe('public, max-age=60');
});

it('applies privacy before real authentication and validation failures and does not fetch protected documents', async () => {
  const server = app();
  const url = `/api/v1/admin/providers/${providerId}/kyc/nbi_clearance?mode=link`;
  const responses: Array<{ status: number; headers: Record<string, string> }> = [];
  responses.push(await request(server).get(url));
  responses.push(await request(server).get('/api/v1/providers/me/kyc/nbi_clearance?mode=link'));
  responses.push(await request(server).get(url).auth('not-a-jwt', { type: 'bearer' }));
  for (const role of ['customer', 'provider', 'provider_staff', 'dpo']) {
    canonicalRole = role;
    responses.push(await request(server).get(url).auth(credential(), { type: 'bearer' }));
  }
  canonicalRole = 'super_admin';
  canonicalVersion = 2;
  responses.push(await request(server).get(url).auth(credential(), { type: 'bearer' }));
  canonicalVersion = 1;
  mustRotatePassword = true;
  responses.push(await request(server).get(url).auth(credential(), { type: 'bearer' }));
  mustRotatePassword = false;
  responses.push(await request(server).get('/api/v1/admin/providers/not-a-uuid/kyc/nbi_clearance').auth(credential(), { type: 'bearer' }));
  responses.push(await request(server).get(`/api/v1/admin/providers/${providerId}/kyc/not-a-document`).auth(credential(), { type: 'bearer' }));
  const csrfDenied = await request(server).post(`/api/v1/admin/providers/${providerId}/reveal-contact`)
    .set('Cookie', `admin_session=${credential()}`);
  expect(csrfDenied.status).toBe(403);
  expect(csrfDenied.body.error.code).toBe('csrf_invalid');
  expect(csrfDenied.headers['cache-control']).toBe('private, no-store');
  expect(contactReveal).not.toHaveBeenCalled();
  canonicalRole = 'provider';
  responses.push(await request(server).get('/api/v1/providers/me/kyc/nbi_clearance?mode=link').auth(credential('provider', reviewerId), { type: 'bearer' }));
  expect(responses.map(response => response.status)).toEqual([401, 401, 401, 403, 403, 403, 403, 401, 428, 400, 400, 404]);
  expect(presign).not.toHaveBeenCalled();
  expect(objectRead).not.toHaveBeenCalled();
  expect(profileRead).not.toHaveBeenCalled();
  for (const response of responses) expect(response.headers['cache-control']).toBe('private, no-store');
});

it('keeps failed private lookups non-storable and does not disguise them as success', async () => {
  const server = app();
  profileRead.mockRejectedValueOnce(createAppError('Provider not found.', 404));
  const absent = await request(server).get(`/api/v1/admin/providers/${providerId}/profile`).auth(credential(), { type: 'bearer' });
  presign.mockRejectedValueOnce(new Error('Synthetic storage unavailable'));
  const failed = await request(server).get(`/api/v1/admin/providers/${providerId}/kyc/nbi_clearance?mode=link`).auth(credential(), { type: 'bearer' });
  expect(absent.status).toBe(404);
  expect(failed.status).toBe(500);
  expect(failed.body.error.message).not.toContain('Synthetic storage unavailable');
  expect(objectRead).not.toHaveBeenCalled();
  for (const response of [absent, failed]) {
    expect(response.body.success).toBe(false);
    expect(response.headers['cache-control']).toBe('private, no-store');
  }
});
