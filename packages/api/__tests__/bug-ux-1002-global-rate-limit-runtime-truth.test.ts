jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock('../src/config/redis.config', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), keys: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getSettingRuntimeControl } from '../src/services/settings.service';

it('Bug UX-1002 — global request-limit controls disclose total-budget and user-versus-IP scope', () => {
  expect(getSettingRuntimeControl('rate_limit_window_ms')).toMatchObject({
    status: 'live',
    editable: true,
    summary: expect.stringMatching(/Within 60 seconds.*total HTTP request budget.*valid server-signed session credentials.*per user.*expired.*source IP/i),
  });
  expect(getSettingRuntimeControl('rate_limit_max_requests')).toMatchObject({
    status: 'live',
    editable: true,
    summary: expect.stringMatching(/total HTTP request cap.*server-signed user identity.*source IP.*not a per-endpoint cap.*before lowering/i),
  });
});
