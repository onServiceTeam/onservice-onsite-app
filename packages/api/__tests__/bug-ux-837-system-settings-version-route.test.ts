import express from 'express';
import request from 'supertest';

const updateSettingMock = jest.fn();

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction): void => {
    (req as express.Request & { user: unknown }).user = {
      userId: 'super-admin-1',
      role: 'super_admin',
    };
    next();
  },
}));

jest.mock('../src/services/settings.service', () => ({
  updateSetting: (...args: unknown[]) => updateSettingMock(...args),
  formatSetting: (setting: unknown) => setting,
}));

import settingsRouter from '../src/routes/settings.routes';
import { errorMiddleware } from '../src/middleware/error.middleware';

it('Bug UX-837 — the admin settings route passes browser version and audit evidence to the mutation service', async () => {
  const expectedUpdatedAt = '2026-08-31T12:34:56.789Z';
  updateSettingMock.mockResolvedValue({ key: 'service_fee_rate', value: '11' });

  const app = express();
  app.use(express.json());
  app.use('/settings', settingsRouter);
  app.use(errorMiddleware);

  const response = await request(app)
    .put('/settings/service_fee_rate')
    .set('user-agent', 'SettingsRouteTest/1.0')
    .send({
      value: '11',
      reason: 'Approved customer fee adjustment.',
      expectedUpdatedAt,
    });

  expect(response.status).toBe(200);
  expect(updateSettingMock).toHaveBeenCalledWith(
    'service_fee_rate',
    '11',
    expect.objectContaining({
      changedBy: 'super-admin-1',
      reason: 'Approved customer fee adjustment.',
      expectedUpdatedAt,
      userAgent: 'SettingsRouteTest/1.0',
    }),
  );
});
