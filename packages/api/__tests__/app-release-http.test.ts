import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import releaseRouter from '../src/routes/app-release.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

// APK updates (Ken, 2026-10-11): installed tester APKs learn about and download
// newer signed builds from our own server. Real Express router and real files
// in a temporary upload folder; nothing is substituted except the logger.

const app = express();
app.use('/api/v1/app-releases', releaseRouter);
app.use(errorMiddleware);

let root: string;
let dir: string;
const savedUploadDir = process.env.UPLOAD_DIR;
const apkBytes = Buffer.alloc(1_200_000, 7);
const sha256 = crypto.createHash('sha256').update(apkBytes).digest('hex');
const manifest = (over: Record<string, unknown> = {}) => ({
  packageName: 'ph.onservice.app', channel: 'tester', versionCode: 2, versionName: '1.0.1', minimumVersionCode: 1,
  file: 'onService-1.0.1-2.apk', sha256, size: apkBytes.length,
  certificateSha256: '1EAAB76ADB7A3EF1EA7CBD496A6E47D37F3F3058F2FB96B7FC08248F4D7D42D9',
  publishedAt: '2026-10-12T02:00:00.000Z', notes: 'Email sign-in replaces phone codes.', ...over,
});
function publish(data: Record<string, unknown>, bytes = apkBytes): void {
  fs.writeFileSync(path.join(dir, String(data.file)), bytes);
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(data));
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'onservice-release-'));
  dir = path.join(root, 'releases', 'android');
  fs.mkdirSync(dir, { recursive: true });
  process.env.UPLOAD_DIR = root;
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  if (savedUploadDir === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = savedUploadDir;
});

it('serves the published release manifest, never cached', async () => {
  publish(manifest());
  const response = await request(app).get('/api/v1/app-releases/android/latest');
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body.data).toEqual({
    packageName: 'ph.onservice.app', channel: 'tester', versionCode: 2, versionName: '1.0.1', minimumVersionCode: 1,
    downloadPath: '/api/v1/app-releases/android/files/onService-1.0.1-2.apk', sha256, size: apkBytes.length,
    certificateSha256: '1EAAB76ADB7A3EF1EA7CBD496A6E47D37F3F3058F2FB96B7FC08248F4D7D42D9',
    publishedAt: '2026-10-12T02:00:00.000Z', notes: 'Email sign-in replaces phone codes.',
  });
});

it('says plainly when nothing is published', async () => {
  const response = await request(app).get('/api/v1/app-releases/android/latest');
  expect(response.status).toBe(404);
  expect(response.body.error.code).toBe('no_release');
});

it('refuses to advertise a manifest that does not match its file or rules', async () => {
  for (const bad of [
    manifest({ size: apkBytes.length + 1 }),
    manifest({ packageName: 'com.other.app' }),
    manifest({ minimumVersionCode: 3 }),
    manifest({ file: 'onService-1.0.2-2.apk' }),
    manifest({ sha256: 'ABC' }),
    { ...manifest(), extra: true },
  ]) {
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    publish(bad);
    const response = await request(app).get('/api/v1/app-releases/android/latest');
    expect({ bad, status: response.status }).toEqual({ bad, status: 503 });
  }
});

// HA-UPD (human audit, 2026-10-13): the app checks the downloaded APK on the
// phone, where only MD5 is cheap, so the manifest may carry an optional md5.
const md5 = crypto.createHash('md5').update(apkBytes).digest('hex');

it('HA-UPD-API-1: a manifest without md5 (like the live 1.0.2 one) is still served, with no md5 field', async () => {
  publish(manifest());
  const response = await request(app).get('/api/v1/app-releases/android/latest');
  expect(response.status).toBe(200);
  expect(response.body.data.sha256).toBe(sha256);
  expect(Object.prototype.hasOwnProperty.call(response.body.data, 'md5')).toBe(false);
});

it('HA-UPD-API-2: a manifest with a lower-case md5 is served with that md5', async () => {
  publish(manifest({ md5 }));
  const response = await request(app).get('/api/v1/app-releases/android/latest');
  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({ versionCode: 2, sha256, md5, size: apkBytes.length });
});

it('HA-UPD-API-3: a malformed md5 makes the manifest invalid, so nothing is advertised', async () => {
  for (const bad of [md5.toUpperCase(), md5.slice(0, 31), `${md5}0`, 'z'.repeat(32), '', null, 12345]) {
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    publish(manifest({ md5: bad }));
    const response = await request(app).get('/api/v1/app-releases/android/latest');
    expect({ bad, status: response.status }).toEqual({ bad, status: 503 });
  }
});

it('serves the APK with the Android package type and an immutable cache', async () => {
  publish(manifest());
  const response = await request(app).get('/api/v1/app-releases/android/files/onService-1.0.1-2.apk')
    .buffer(true).parse((res, done) => { const chunks: Buffer[] = []; res.on('data', c => chunks.push(c)); res.on('end', () => done(null, Buffer.concat(chunks))); });
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toBe('application/vnd.android.package-archive');
  expect(response.headers['content-disposition']).toBe('attachment; filename="onService-1.0.1-2.apk"');
  expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  expect(Number(response.headers['content-length'])).toBe(apkBytes.length);
  expect(crypto.createHash('sha256').update(response.body as Buffer).digest('hex')).toBe(sha256);
  const resumed = await request(app).get('/api/v1/app-releases/android/files/onService-1.0.1-2.apk').set('Range', 'bytes=0-9');
  expect(resumed.status).toBe(206);
});

it('serves nothing but APK release files from the release folder', async () => {
  publish(manifest());
  fs.writeFileSync(path.join(root, 'secret.txt'), 'private');
  for (const name of ['latest.json', '..%2Fsecret.txt', '..%2F..%2Fsecret.txt', 'onService-1.0.1-2.apk.bak',
    'onService-1.0.1-9.apk', '.hidden.apk']) {
    const response = await request(app).get(`/api/v1/app-releases/android/files/${name}`);
    expect({ name, status: response.status }).toEqual({ name, status: 404 });
  }
});
