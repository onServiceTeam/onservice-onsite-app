const queryMock = jest.fn();
const getSettingBooleanMock = jest.fn().mockResolvedValue(false);

jest.mock('../src/models/db', () => ({ db: { query: queryMock } }));
jest.mock('../src/services/settings.service', () => ({
  getSettingBoolean: (...args: unknown[]) => getSettingBooleanMock(...args),
}));

import { resolvePromo } from '../src/services/booking/promo.service';

it('Bug UX-680 — the server rejects direct promo redemption while the D13 launch hold is off', async () => {
  await expect(resolvePromo({
    code: 'WELCOME10',
    subtotalCents: 100_000,
    userId: 'customer-1',
  })).rejects.toMatchObject({ statusCode: 409, message: 'promo_redemption_unavailable' });
  expect(getSettingBooleanMock).toHaveBeenCalledWith('feature_flag.promo_redemption_enabled');
  expect(queryMock).not.toHaveBeenCalled();
});
