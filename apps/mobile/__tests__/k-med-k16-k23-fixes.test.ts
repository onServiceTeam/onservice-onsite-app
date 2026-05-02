// Phase K MED-K16 + K23 — fixes verified.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const PHONE_INPUT = readFileSync(
  resolve(__dirname, '../src/components/PhoneInput.tsx'),
  'utf8',
);
const USE_OFFLINE = readFileSync(
  resolve(__dirname, '../src/hooks/useOffline.ts'),
  'utf8',
);

describe('Phase K MED-K16 — PhoneInput regex accepts +63 prefix', () => {
  it('MED-K16 — PH_MOBILE_REGEX matches utils/phone.validatePHPhone shape', () => {
    expect(PHONE_INPUT).toMatch(/PH_MOBILE_REGEX = \/\^\(\\\+63\|0\)\?9\\d\{9\}\$\//);
  });
  it('MED-K16 — runtime: regex accepts +639XX, 09XX, 9XX', async () => {
    const { PH_MOBILE_REGEX } = await import('../src/components/PhoneInput');
    expect(PH_MOBILE_REGEX.test('+639171234567')).toBe(true);
    expect(PH_MOBILE_REGEX.test('09171234567')).toBe(true);
    expect(PH_MOBILE_REGEX.test('9171234567')).toBe(true);
    // Invalid: missing 9 prefix
    expect(PH_MOBILE_REGEX.test('+638171234567')).toBe(false);
    expect(PH_MOBILE_REGEX.test('5551234567')).toBe(false);
  });
  it('MED-K16 — normalizePhilippineMobile preserves +63 input verbatim', async () => {
    const { normalizePhilippineMobile } = await import('../src/components/PhoneInput');
    expect(normalizePhilippineMobile('+639171234567')).toBe('+639171234567');
    expect(normalizePhilippineMobile('09171234567')).toBe('+639171234567');
    expect(normalizePhilippineMobile('9171234567')).toBe('+639171234567');
  });
});

describe('Phase K MED-K23 — useOffline subscribes to NetInfo events (with polling fallback)', () => {
  it('MED-K23 — dynamic import of @react-native-community/netinfo', () => {
    expect(USE_OFFLINE).toMatch(/await import\('@react-native-community\/netinfo'\)/);
  });
  it('MED-K23 — NetInfo.addEventListener wired with cleanup', () => {
    expect(USE_OFFLINE).toMatch(/unsubscribeNetInfo = NetInfo\.addEventListener/);
    expect(USE_OFFLINE).toMatch(/unsubscribeNetInfo\?\.\(\)/);
  });
  it('MED-K23 — fallback poll interval 60s (was 30s)', () => {
    expect(USE_OFFLINE).toMatch(/}, 60_000\)/);
    expect(USE_OFFLINE).not.toMatch(/}, 30_000\)/);
  });
});
