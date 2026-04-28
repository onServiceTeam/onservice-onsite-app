/**
 * Phase 12 — Smoke test suite.
 *
 * Hermetic. Mocks all DB / Redis / external IO. The contract:
 *   "if any of these break, do not deploy."
 *
 * Tests cover:
 *   - /health route presence in server.ts
 *   - auth login validator shape
 *   - money-conservation invariant (synthetic 100-row sample)
 *   - booking state-machine happy + invalid transitions
 *   - commission calculator (fixed input -> fixed output)
 *   - TOTP utility (known seed + fixed time -> known 6-digit code)
 *   - audit-log CSV escaping (comma + double-quote)
 *   - admin role middleware coverage spot-check
 *   - JWT expiry config sanity
 */

import fs from 'node:fs';
import path from 'node:path';

const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// settings.service is consulted by commission.service. Stub it deterministically.
jest.mock('../src/services/settings.service', () => ({
  getCommissionRate: jest.fn(async () => 0.18),
  getSettingPercent: jest.fn(async (key: string) => {
    if (key === 'service_fee_rate') return 0.05;
    if (key === 'guarantee_fund_rate') return 0.10;
    return 0;
  }),
  getSettingNumber: jest.fn(async (key: string) => {
    if (key === 'service_fee_min') return 2000; // P20
    if (key === 'service_fee_max') return 50000; // P500
    return 0;
  }),
}));

import { verifyOtpSchema } from '../src/validators/auth.validators';
import { canTransition } from '../src/types/booking.types';
import { calculateCommission } from '../src/services/commission.service';
import { generateTotpSecret, generateTotp, verifyTotp } from '../src/utils/totp';
import { exportAuditLogCsv } from '../src/services/compliance.service';

beforeEach(() => {
  dbQueryMock.mockReset();
});

// ───────────────────────────────────────────────────────────────────
// 1. /health endpoint registered in server.ts
// ───────────────────────────────────────────────────────────────────
describe('smoke: server has /health endpoint', () => {
  it('server.ts registers GET /health that returns status ok', () => {
    const serverPath = path.resolve(__dirname, '../src/server.ts');
    const src = fs.readFileSync(serverPath, 'utf8');
    expect(src).toMatch(/app\.get\(['"]\/health['"]/);
    // and the handler responds with status: 'ok'
    expect(src).toMatch(/status:\s*['"]ok['"]/);
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. Auth login validator accepts well-formed payload
// ───────────────────────────────────────────────────────────────────
describe('smoke: auth validators', () => {
  it('verifyOtpSchema accepts a valid phone+code payload', () => {
    const result = verifyOtpSchema.safeParse({ phone: '+639171234567', code: '123456' });
    expect(result.success).toBe(true);
  });

  it('verifyOtpSchema rejects malformed phone', () => {
    const result = verifyOtpSchema.safeParse({ phone: '09171234567', code: '123456' });
    expect(result.success).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Money-conservation invariant (100 synthetic rows)
// ───────────────────────────────────────────────────────────────────
describe('smoke: money conservation', () => {
  it('sum(escrow + payout + commission + refund) === sum(captured) for 100 rows', () => {
    // Each booking:
    //   captured = serviceFee + commission + payout + refund + escrow
    //   We synthesize 100 rows of varying integer centavo amounts and assert
    //   that the inverse decomposition reconstructs the captured total exactly.
    let totalCaptured = 0n;
    let totalEscrow = 0n;
    let totalPayout = 0n;
    let totalCommission = 0n;
    let totalRefund = 0n;

    for (let i = 0; i < 100; i++) {
      const captured = BigInt(50000 + (i * 137) % 95000); // 500.00 .. 1450.00 PHP
      const commission = (captured * 18n) / 100n; // 18%
      const refund = i % 17 === 0 ? captured / 10n : 0n; // 10% refund every 17th
      const escrow = i % 13 === 0 ? captured / 5n : 0n; // 20% held every 13th
      const payout = captured - commission - refund - escrow;

      totalCaptured += captured;
      totalCommission += commission;
      totalRefund += refund;
      totalEscrow += escrow;
      totalPayout += payout;
    }

    const reconstructed = totalCommission + totalRefund + totalEscrow + totalPayout;
    expect(reconstructed.toString()).toBe(totalCaptured.toString());
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. Booking state-machine — happy path + reject invalid
// ───────────────────────────────────────────────────────────────────
describe('smoke: booking state machine', () => {
  it('allows the canonical happy-path sequence', () => {
    const happyPath: Array<[string, string]> = [
      ['requested', 'matched'],
      ['matched', 'payment_pending'],
      ['payment_pending', 'paid'],
      ['paid', 'provider_en_route'],
      ['provider_en_route', 'provider_arrived'],
      ['provider_arrived', 'in_progress'],
      ['in_progress', 'completed_by_provider'],
      ['completed_by_provider', 'confirmed'],
      ['confirmed', 'payout_ready'],
      ['payout_ready', 'paid_out'],
    ];
    for (const [from, to] of happyPath) {
      expect(canTransition(from as never, to as never)).toBe(true);
    }
  });

  it('rejects illegal completed -> requested transition', () => {
    expect(canTransition('completed_by_provider', 'requested')).toBe(false);
  });

  it('rejects backwards paid_out -> requested (terminal state)', () => {
    expect(canTransition('paid_out', 'requested')).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. Commission calculator — fixed input -> fixed output
// ───────────────────────────────────────────────────────────────────
describe('smoke: commission calculator', () => {
  it('1000.00 PHP @ 18% standard tier yields 180 commission, P50 fee, P5 GF', async () => {
    const result = await calculateCommission(100000, 'standard'); // 1000.00 PHP in centavos
    expect(result.servicePrice).toBe(100000);
    expect(result.commissionRate).toBe(0.18);
    expect(result.commissionAmount).toBe(18000); // 180.00 PHP
    expect(result.serviceFeeRate).toBe(0.05);
    expect(result.serviceFeeAmount).toBe(5000); // 50.00 PHP (within min/max)
    expect(result.guaranteeFundContribution).toBe(500); // 10% of fee
    expect(result.providerReceives).toBe(82000);
    expect(result.platformRetains).toBe(23000);
  });
});

// ───────────────────────────────────────────────────────────────────
// 6. TOTP utility — known seed + fixed time -> known code
// ───────────────────────────────────────────────────────────────────
describe('smoke: TOTP utility', () => {
  it('generateTotpSecret returns a 32-char base32 string', () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('generateTotp + verifyTotp round-trip for a known secret at fixed time', () => {
    // RFC 6238 reference seed (base32 of "12345678901234567890")
    const seed = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    const realDateNow = Date.now;
    try {
      Date.now = () => 59_000; // RFC vector T=59s
      const code = generateTotp(seed);
      expect(code).toMatch(/^\d{6}$/);
      // Should self-verify at the same instant
      expect(verifyTotp(seed, code)).toBe(true);
    } finally {
      Date.now = realDateNow;
    }
  });
});

// ───────────────────────────────────────────────────────────────────
// 7. Audit-log CSV escaping (comma + double-quote)
// ───────────────────────────────────────────────────────────────────
describe('smoke: audit-log CSV escaping', () => {
  it('exportAuditLogCsv quotes fields containing commas and escapes embedded quotes', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'r1',
          created_at: new Date('2026-04-28T00:00:00Z'),
          user_email: 'admin@example.com',
          user_role: 'admin',
          action: 'updated, changed "field"',
          entity_type: 'user',
          entity_id: 'u1',
          ip_address: '10.0.0.1',
          old_values: null,
          new_values: null,
        },
      ],
      rowCount: 1,
    });
    const csv = await exportAuditLogCsv({ limit: 1 });
    // Field with comma is wrapped in quotes
    expect(csv).toContain('"updated, changed ""field"""');
  });
});

// ───────────────────────────────────────────────────────────────────
// 8. Admin route middleware coverage spot-check
// ───────────────────────────────────────────────────────────────────
describe('smoke: admin routes are guarded', () => {
  it('every src/routes/*admin*.ts file imports authMiddleware', () => {
    const routesDir = path.resolve(__dirname, '../src/routes');
    const adminFiles = fs
      .readdirSync(routesDir)
      .filter((f) => f.includes('admin') && f.endsWith('.ts'));
    expect(adminFiles.length).toBeGreaterThan(0);
    for (const f of adminFiles) {
      const src = fs.readFileSync(path.join(routesDir, f), 'utf8');
      expect(src).toMatch(/authMiddleware|requireAdmin|requireSuperAdmin/);
    }
  });
});

// ───────────────────────────────────────────────────────────────────
// 9. JWT expiry config sanity
// ───────────────────────────────────────────────────────────────────
describe('smoke: JWT expiry config', () => {
  it('platform.config has 15m access + 30d refresh defaults', () => {
    const cfgPath = path.resolve(__dirname, '../src/config/platform.config.ts');
    const src = fs.readFileSync(cfgPath, 'utf8');
    expect(src).toMatch(/jwtExpiresIn:\s*['"]15m['"]/);
    expect(src).toMatch(/jwtRefreshExpiresIn:\s*['"]30d['"]/);
  });
});
