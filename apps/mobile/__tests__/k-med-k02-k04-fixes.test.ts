// Phase K MED-K02 + K04 — fixes verified.
//
// MED-K02: auth.store.ts verifyOtp now validates the response shape
// before destructuring tokens/user. Pre-fix a malformed backend
// response would silently store undefined tokens and a signed-in
// user with no user object.
//
// MED-K04: 5 remaining mobile screens that called Alert.alert with
// raw err.message migrated to the canonical getErrorMessage helper.
// The K04 fix had been partial in earlier sessions (most screens
// migrated via batch script, these 5 missed by the regex pattern).

import { readFileSync } from 'fs';
import { resolve } from 'path';

const AUTH_STORE = readFileSync(
  resolve(__dirname, '../src/stores/auth.store.ts'),
  'utf8',
);
const MAKE_RECURRING = readFileSync(
  resolve(__dirname, '../app/customer/booking/make-recurring.tsx'),
  'utf8',
);
const NOTIF_SETTINGS = readFileSync(
  resolve(__dirname, '../app/customer/notification-settings.tsx'),
  'utf8',
);
const RECURRING_DETAIL = readFileSync(
  resolve(__dirname, '../app/customer/recurring/[id].tsx'),
  'utf8',
);
const AVAILABILITY = readFileSync(
  resolve(__dirname, '../app/provider/availability.tsx'),
  'utf8',
);
const PAYOUT_SETTINGS = readFileSync(
  resolve(__dirname, '../app/provider/payout-settings.tsx'),
  'utf8',
);

describe('Phase K MED-K02 — verifyOtp validates response shape', () => {
  it('K02 — accessToken is checked as non-empty string before storeTokens', () => {
    expect(AUTH_STORE).toMatch(/typeof data\.accessToken !== 'string' \|\| data\.accessToken\.length === 0/);
  });
  it('K02 — refreshToken is checked as non-empty string', () => {
    expect(AUTH_STORE).toMatch(/typeof data\.refreshToken !== 'string' \|\| data\.refreshToken\.length === 0/);
  });
  it('K02 — user is checked as a non-null object', () => {
    expect(AUTH_STORE).toMatch(/!data\.user \|\| typeof data\.user !== 'object'/);
  });
  it('K02 — bare destructure (pre-fix shape) is gone', () => {
    expect(AUTH_STORE).not.toMatch(
      /const \{ accessToken, refreshToken, user, isNewUser \} = res\.data\.data;/,
    );
  });
  it('K02 — header comment cites K-MED-K02', () => {
    expect(AUTH_STORE).toMatch(/Phase K MED-K02 fix/);
  });
});

describe('Phase K MED-K04 — 5 remaining screens migrated to getErrorMessage', () => {
  it('K04 — make-recurring.tsx imports getErrorMessage and stops using raw err.message', () => {
    expect(MAKE_RECURRING).toMatch(/import \{ getErrorMessage \} from ['"]@\/utils\/errors['"]/);
    expect(MAKE_RECURRING).not.toMatch(/Alert\.alert\(['"]Error['"], err\.message/);
  });
  it('K04 — notification-settings.tsx migrated', () => {
    expect(NOTIF_SETTINGS).toMatch(/import \{ getErrorMessage \} from ['"]@\/utils\/errors['"]/);
    expect(NOTIF_SETTINGS).not.toMatch(/Alert\.alert\(['"]Error['"], err\.message/);
  });
  it('K04 — recurring/[id].tsx migrated (multi-mutation file)', () => {
    expect(RECURRING_DETAIL).toMatch(/import \{ getErrorMessage \} from ['"]@\/utils\/errors['"]/);
    expect(RECURRING_DETAIL).not.toMatch(/onError: \(err: Error\) => Alert\.alert\(['"]Error['"], err\.message\)/);
  });
  it('K04 — provider/availability.tsx migrated', () => {
    expect(AVAILABILITY).toMatch(/import \{ getErrorMessage \} from ['"]@\/utils\/errors['"]/);
    expect(AVAILABILITY).not.toMatch(/onError: \(err: Error\) => Alert\.alert\(['"]Error['"], err\.message\)/);
  });
  it('K04 — provider/payout-settings.tsx migrated', () => {
    expect(PAYOUT_SETTINGS).toMatch(/import \{ getErrorMessage \} from ['"]@\/utils\/errors['"]/);
    expect(PAYOUT_SETTINGS).not.toMatch(/Alert\.alert\(['"]Error['"], err\.message/);
  });
});
