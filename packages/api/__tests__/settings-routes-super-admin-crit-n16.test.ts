import express from 'express';
import request from 'supertest';

const updateSettingMock = jest.fn();
const bulkUpdateSettingsMock = jest.fn();
const resetToDefaultMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    const role = req.header('x-test-role') ?? 'admin';
    (req as express.Request & { user: unknown }).user = { userId: 'staff-1', role };
    next();
  },
}));

jest.mock('../src/services/settings.service', () => ({
  updateSetting: (...args: unknown[]) => updateSettingMock(...args),
  bulkUpdateSettings: (...args: unknown[]) => bulkUpdateSettingsMock(...args),
  resetToDefault: (...args: unknown[]) => resetToDefaultMock(...args),
  formatSetting: (setting: unknown) => setting,
}));

import settingsRouter from '../src/routes/settings.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('CRIT-N16 — every System Settings mutation rejects a junior admin at the real route boundary', async () => {
  const app = express();
  app.use(express.json());
  app.use('/settings', settingsRouter);
  app.use(errorMiddleware);

  const responses = await Promise.all([
    request(app).put('/settings').set('x-test-role', 'admin').send({
      updates: [{ key: 'otp_length', value: '7', expectedUpdatedAt: '2026-08-31T00:00:00.000Z' }],
      reason: 'Approved authentication policy change.',
    }),
    request(app).put('/settings/otp_length').set('x-test-role', 'admin').send({
      value: '7', reason: 'Approved authentication policy change.',
      expectedUpdatedAt: '2026-08-31T00:00:00.000Z',
    }),
    request(app).post('/settings/otp_length/reset').set('x-test-role', 'admin').send({
      reason: 'Restore approved authentication policy.',
      expectedUpdatedAt: '2026-08-31T00:00:00.000Z',
    }),
  ]);

  expect(responses.map((response) => response.status)).toEqual([403, 403, 403]);
  expect(updateSettingMock).not.toHaveBeenCalled();
  expect(bulkUpdateSettingsMock).not.toHaveBeenCalled();
  expect(resetToDefaultMock).not.toHaveBeenCalled();
});
