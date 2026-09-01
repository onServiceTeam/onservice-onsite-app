const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/config/redis.config', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), keys: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import apiPackageJson from '../package.json';
import { getClientConfig } from '../src/services/settings.service';

it('MED-N109 — client configuration reports the packaged API version at runtime', async () => {
  dbQueryMock.mockResolvedValue({ rows: [], rowCount: 0 });

  const config = await getClientConfig();

  expect(config.appVersion).toBe(apiPackageJson.version);
  expect(dbQueryMock).toHaveBeenCalledTimes(2);
});
