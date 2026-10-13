// HA-M2-377 (customer human audit 2026-10-13, D38 Milestone 2, package P3
// review fix; P3 overflow number, see HA-M2-370): when the real server.ts
// starts listening it creates the two private job-media folders on the
// uploads volume, private-artifacts/job-media (stored files) and
// private-artifacts/job-media-tmp (chunks), so the first upload never has
// to, and re-tightens them to 0700 on every start. The permission bits are
// asserted where the platform has them (Linux, as on the server and in CI);
// Windows has no POSIX modes, so there only the folders are checked. The
// real app is imported with its listen call suppressed but its start-up
// callback run; database and Redis are the shared mocks.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { importServerForTest } from './helpers/import-server';

jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('@sentry/node', () => ({ init: jest.fn(), setupExpressErrorHandler: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/socket.service', () => ({ initSocketServer: jest.fn() }));
jest.mock('../src/jobs/workers', () => ({ initScheduledJobs: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/jobs/queue', () => ({
  notificationQueue: { add: jest.fn() }, smsQueue: { add: jest.fn() },
  payoutQueue: { add: jest.fn() }, bookingQueue: { add: jest.fn() },
}));

it('HA-M2-377: server start creates both private job-media folders (0700)', async () => {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onservice-ha-m2-377-'));
  const saved = process.env.UPLOAD_DIR;
  process.env.UPLOAD_DIR = uploadDir;
  try {
    const store = path.join(uploadDir, 'private-artifacts', 'job-media');
    const temp = path.join(uploadDir, 'private-artifacts', 'job-media-tmp');
    expect(fs.existsSync(store) || fs.existsSync(temp)).toBe(false);

    await importServerForTest({}, { runListenCallback: true });
    for (let waited = 0; waited < 5000 && !(fs.existsSync(store) && fs.existsSync(temp)); waited += 50) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    for (const folder of [store, temp]) {
      expect(fs.statSync(folder).isDirectory()).toBe(true);
      if (process.platform !== 'win32') expect(fs.statSync(folder).mode & 0o777).toBe(0o700);
    }
  } finally {
    if (saved === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = saved;
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
}, 30_000);
