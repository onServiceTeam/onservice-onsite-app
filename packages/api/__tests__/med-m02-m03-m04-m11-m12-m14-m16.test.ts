// MED-M02 / M03 / M04 / M11 / M12 / M14 / M16 fixes — middleware +
// utils + jobs hardening cluster.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...a: unknown[]) => dbQueryMock(...a),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const IP_BLOCK = readFileSync(
  resolve(__dirname, '../src/middleware/ip-block.middleware.ts'),
  'utf8',
);
const AUDIT_MW = readFileSync(
  resolve(__dirname, '../src/middleware/audit.middleware.ts'),
  'utf8',
);
const AUTH_MW = readFileSync(
  resolve(__dirname, '../src/middleware/auth.middleware.ts'),
  'utf8',
);
const LOGGER_SRC = readFileSync(
  resolve(__dirname, '../src/utils/logger.ts'),
  'utf8',
);
const COOKIES_SRC = readFileSync(
  resolve(__dirname, '../src/utils/admin-cookies.ts'),
  'utf8',
);
const WORKERS = readFileSync(
  resolve(__dirname, '../src/jobs/workers.ts'),
  'utf8',
);

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
});

describe('MED-M02 — ip-block fails closed on sensitive paths', () => {
  it('MED-M02 — FAIL_CLOSED_PREFIXES list includes admin/payouts/wallet/payments/webhooks/compliance/bir/dispute', () => {
    expect(IP_BLOCK).toMatch(/'\/api\/v1\/admin'/);
    expect(IP_BLOCK).toMatch(/'\/api\/v1\/payouts'/);
    expect(IP_BLOCK).toMatch(/'\/api\/v1\/wallet'/);
    expect(IP_BLOCK).toMatch(/'\/api\/v1\/payments'/);
    expect(IP_BLOCK).toMatch(/'\/api\/v1\/webhooks'/);
    expect(IP_BLOCK).toMatch(/'\/api\/v1\/compliance'/);
    expect(IP_BLOCK).toMatch(/'\/api\/v1\/bir-admin'/);
    expect(IP_BLOCK).toMatch(/'\/api\/v1\/dispute-admin'/);
  });
  it('MED-M02 — sensitive path failure returns 503', () => {
    expect(IP_BLOCK).toMatch(/IP block check failed on sensitive path — failing closed \(503\)/);
    expect(IP_BLOCK).toMatch(/res\.status\(503\)/);
  });
  it('MED-M02 — non-sensitive path still fails open with logger.error', () => {
    expect(IP_BLOCK).toMatch(/IP block check failed on non-sensitive path — failing open/);
  });
  it('MED-M01 follow-up — getClientIp uses req.ip (trust-proxy aware)', () => {
    expect(IP_BLOCK).toMatch(/typeof req\.ip === 'string'/);
    expect(IP_BLOCK).not.toMatch(/req\.headers\['x-forwarded-for'\]\s*;/);
  });
});

describe('MED-M03 — audit middleware exposes failure metrics + fails closed past threshold', () => {
  it('MED-M03 — auditFailureMetrics exported with consecutiveFailures + totalFailures', () => {
    expect(AUDIT_MW).toMatch(/export const auditFailureMetrics = \{/);
    expect(AUDIT_MW).toMatch(/consecutiveFailures: 0/);
    expect(AUDIT_MW).toMatch(/totalFailures: 0/);
    expect(AUDIT_MW).toMatch(/lastFailureMessage:/);
  });
  it('MED-M03 — FAIL_CLOSED_THRESHOLD const present + 503 path on threshold breach', () => {
    expect(AUDIT_MW).toMatch(/const FAIL_CLOSED_THRESHOLD = 10/);
    expect(AUDIT_MW).toMatch(/Audit subsystem failing — refusing sensitive write/);
    expect(AUDIT_MW).toMatch(/res\.status\(503\)/);
  });
  it('MED-M03 — counter resets on successful write', () => {
    expect(AUDIT_MW).toMatch(/auditFailureMetrics\.consecutiveFailures = 0/);
  });
  it('MED-M03 — failure log includes rowPayload for backfill', () => {
    expect(AUDIT_MW).toMatch(/rowPayload: \{ userId, action, entityType, entityId, ip, userAgent \}/);
  });
});

describe('MED-M04 — auth.middleware distinguishes expired vs malformed JWT', () => {
  it('MED-M04 — TokenExpiredError gets code=token_expired', () => {
    expect(AUTH_MW).toMatch(/e\?\.name === 'TokenExpiredError'/);
    expect(AUTH_MW).toMatch(/'token_expired'/);
  });
  it('MED-M04 — JsonWebTokenError gets code=token_invalid', () => {
    expect(AUTH_MW).toMatch(/e\?\.name === 'JsonWebTokenError'/);
    expect(AUTH_MW).toMatch(/'token_invalid'/);
  });
  it('MED-M04 — error messages differ between expired ("expired") and invalid ("Invalid")', () => {
    expect(AUTH_MW).toMatch(/Authentication token expired\./);
    expect(AUTH_MW).toMatch(/Invalid authentication token\./);
  });
});

describe('MED-M11 — logger key-based redaction for password/hash/secret/token', () => {
  it('MED-M11 — SENSITIVE_KEY_PATTERN regex covers password|hash|secret|token|api_key|encryption_key', () => {
    expect(LOGGER_SRC).toMatch(/SENSITIVE_KEY_PATTERN = \/\(password\|hash\|secret\|token\|api\[_-\]\?key\|encryption\[_-\]\?key\|totp\[_-\]\?secret\|refresh\|access\)\/i/);
  });
  it('MED-M11 — sensitive key value is replaced with [REDACTED:key]', () => {
    expect(LOGGER_SRC).toMatch(/obj\[k\] = '\[REDACTED:key\]'/);
  });
});

describe('MED-M12 — audit context documented; 15-min access-cookie cap intentional', () => {
  it('MED-M12 — explanation of access, refresh, canonical user state, and CSRF split is in source', () => {
    expect(COOKIES_SRC).toMatch(/short-lived JWT carrying/);
    expect(COOKIES_SRC).toMatch(/current user role\/activity\/session generation/);
    expect(COOKIES_SRC).toMatch(/refresh cookie \+ refresh-token JWT\/row/);
    expect(COOKIES_SRC).toMatch(/admin_csrf_tokens\.expires_at — bound to the access cookie/);
  });
  it('MED-M12 — 15-min cap preserved (security, NOT a setting bug)', () => {
    expect(COOKIES_SRC).toMatch(/15 \* 60 \* 1000/);
  });
});

describe('MED-M16 — autoConfirmBookings wraps escrow + status flip in single transaction', () => {
  it('MED-M16 — db.transaction wraps the entire confirmed → payout_ready sequence', () => {
    expect(WORKERS).toMatch(/await db\.transaction\(async \(client\) => \{[\s\S]+?releaseEscrowInTransaction\(client, booking\.id\)[\s\S]+?'payout_ready'/);
  });
  it('MED-M16 — uses releaseEscrowInTransaction (not the legacy releaseEscrow)', () => {
    // The legacy non-trx releaseEscrow call (escrowService.releaseEscrow(...))
    // should be gone from the auto-confirm path. (It still exists in the
    // service for back-compat but autoConfirm now uses the trx variant.)
    const start = WORKERS.indexOf('async function autoConfirmBookings');
    const end = WORKERS.indexOf('async function expireStaleQuotes');
    const autoConfirmBody = WORKERS.slice(start, end);
    expect(autoConfirmBody).toMatch(/releaseEscrowInTransaction/);
    expect(autoConfirmBody).not.toMatch(/escrowService\.releaseEscrow\(booking\.id\)/);
  });
  it('MED-M16 — booking_already_advanced race is not logged as an error', () => {
    expect(WORKERS).toMatch(/booking_already_advanced/);
    expect(WORKERS).toMatch(/if \(msg !== 'booking_already_advanced'\)/);
  });
});
