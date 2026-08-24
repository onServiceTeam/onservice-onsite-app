const dbQueryMock = jest.fn();
const redisGetMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/config/redis.config', () => ({
  redis: {
    get: (...args: unknown[]) => redisGetMock(...args),
    set: jest.fn(async () => 'OK'),
    del: jest.fn(async () => 1),
    keys: jest.fn(async () => []),
  },
}));

import {
  getAllSettings,
  getCategories,
  getSettingsByCategory,
} from '../src/services/settings.service';

describe('admin settings registry visibility', () => {
  it('Bug UX199 — inactive or legally pulled controls are excluded from every admin settings listing', async () => {
    redisGetMock.mockResolvedValueOnce(null);
    dbQueryMock.mockResolvedValue({ rows: [] });

    await getAllSettings();
    await getSettingsByCategory('protection');
    await getCategories();

    expect(dbQueryMock.mock.calls[0]![0]).toMatch(/WHERE is_active = TRUE/);
    expect(dbQueryMock.mock.calls[1]![0]).toMatch(/category = \$1 AND is_active = TRUE/);
    expect(dbQueryMock.mock.calls[2]![0]).toMatch(/WHERE is_active = TRUE/);
  });
});
