/**
 * Behavioral service smoke tests, replacing the Phase 12 structural checks.
 *
 * Hermetic. Mocks all DB / Redis / external IO. The contract:
 *   "if any of these break, do not deploy."
 *
 * Tests cover:
 *   - auth login validator shape
 *   - commission allocation across centavo rounding and fee boundaries
 *   - booking state-machine happy + invalid transitions
 *   - commission calculator (fixed input -> fixed output)
 *   - TOTP utility (independently specified 6-digit code + round-trip)
 *   - audit-log CSV escaping (comma + double-quote)
 * Real mounted health handlers: server-health-smoke.test.ts.
 * Selected HTTP role boundaries: admin-access-smoke.test.ts.
 * Issued token lifetimes: auth-token-expiry-smoke.test.ts.
 * These bounded checks do not prove the full ledger or every admin endpoint.
 */

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
// 3. Actual calculator allocation, NOT persisted escrow/payment conservation
// ───────────────────────────────────────────────────────────────────
describe('smoke: commission allocation with synthetic settings', () => {
  it.each([
    // Fixed expected results are independent of the calculator implementation.
    // The 18% tier and customer fee here are fixtures, not current live policy.
    { price: 10001, commission: 1800, fee: 2000, provider: 8201, platform: 3800, fund: 200 },
    { price: 33333, commission: 6000, fee: 2000, provider: 27333, platform: 8000, fund: 200 },
    { price: 100003, commission: 18001, fee: 5000, provider: 82002, platform: 23001, fund: 500 },
    { price: 2000001, commission: 360000, fee: 50000, provider: 1640001, platform: 410000, fund: 5000 },
  ])('allocates $price centavos using the service, including fee floor/cap', async (fixture) => {
    const actual = await calculateCommission(fixture.price, 'standard');
    expect(actual).toEqual({
      servicePrice: fixture.price,
      commissionRate: 0.18,
      commissionAmount: fixture.commission,
      serviceFeeRate: 0.05,
      serviceFeeAmount: fixture.fee,
      guaranteeFundContribution: fixture.fund,
      providerReceives: fixture.provider,
      platformRetains: fixture.platform,
    });
    expect(actual.providerReceives + actual.platformRetains).toBe(fixture.price + fixture.fee);
  });

  it.todo('Persisted capture/refund/escrow/payout conservation needs an isolated real-PostgreSQL lifecycle fixture; calculator checks do not prove it');
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
// 6. TOTP utility — independent expected code as well as self-verification
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
      // RFC 6238 Appendix B gives SHA1 94287082 at T=59. The app uses
      // six digits, so the same truncation modulo 10^6 gives 287082.
      // https://www.rfc-editor.org/rfc/rfc6238#appendix-B
      expect(code).toBe('287082');
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
