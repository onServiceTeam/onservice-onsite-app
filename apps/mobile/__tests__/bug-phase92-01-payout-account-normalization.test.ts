// BUG-PHASE92-01 — provider payout/withdraw screens normalize account
// numbers before sending to the server.
//
// The server's payout.service.validateDestinationAccount enforces:
//   - gcash / maya:        /^09\d{9}$/    (11 digits, no spaces)
//   - bank_instapay/pesonet: /^\d{8,16}$/  (digits only)
//
// Pre-fix the mobile screens sent `account.trim()` raw and the
// placeholder "09XX XXX XXXX" actively encouraged providers to
// type spaces ("0917 555 1234"). Submit returned HTTP 400 with the
// "must be an 11-digit PH mobile number" Zod-shaped error — confusing
// for a provider who entered exactly what the placeholder showed.
//
// Fix: both withdraw.tsx and payout-settings.tsx strip non-digits via
// normalizeAccount(raw) before submit so the placeholder format
// round-trips successfully.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const WITHDRAW = readFileSync(
  resolve(__dirname, '../app/provider/withdraw.tsx'),
  'utf8',
);
const PAYOUT_SETTINGS = readFileSync(
  resolve(__dirname, '../app/provider/payout-settings.tsx'),
  'utf8',
);

describe('BUG-PHASE92-01 — withdraw + payout-settings strip non-digits before submit', () => {
  it('BUG-PHASE92-01 — withdraw.tsx defines normalizeAccount stripping \\D+', () => {
    expect(WITHDRAW).toMatch(/normalizeAccount[\s\S]*?replace\(\/\\D\+\/g, ''\)/);
  });

  it('BUG-PHASE92-01 — withdraw.tsx submits the normalized account, not raw .trim()', () => {
    expect(WITHDRAW).toMatch(/destinationAccount: normalizeAccount\(account\)/);
    // The pre-fix path sent `account.trim()` directly inside the
    // POST body. That exact line must be gone.
    expect(WITHDRAW).not.toMatch(/destinationAccount: account\.trim\(\),\n\s+\}\);/);
  });

  it('BUG-PHASE92-01 — payout-settings.tsx defines its own normalizeAccount with the same shape', () => {
    expect(PAYOUT_SETTINGS).toMatch(/normalizeAccount[\s\S]*?replace\(\/\\D\+\/g, ''\)/);
  });

  it('BUG-PHASE92-01 — payout-settings.tsx submits the normalized account', () => {
    expect(PAYOUT_SETTINGS).toMatch(/destinationAccount: normalizedAccount \|\| null/);
    // The pre-fix code sent `account.trim() || null`. Make sure
    // we're not silently re-pasting it.
    expect(PAYOUT_SETTINGS).not.toMatch(/destinationAccount: account\.trim\(\) \|\| null/);
  });

  it('BUG-PHASE92-01 — payout-settings.tsx required-field check uses the normalized length', () => {
    // The "frequency !== 'manual' && !account.trim()" gate was a
    // false-positive: a string of pure spaces like "   " would
    // .trim() to '' but also fail server-side. Now the gate uses
    // the normalized length so it only blocks truly empty input.
    expect(PAYOUT_SETTINGS).toMatch(/frequency !== 'manual' && normalizedAccount\.length === 0/);
  });
});
