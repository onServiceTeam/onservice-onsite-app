// MED-N116 / MED-N119 / MED-N121 / MED-N122 / MED-N123 / MED-N124 / MED-N132 fixes verified.

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/settings.service', () => ({
  getSetting: jest.fn().mockResolvedValue('25000'),
}));
jest.mock('../src/services/notification.service', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/slack-alert.service', () => ({
  sendSlackAlert: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@sentry/node', () => ({
  captureMessage: jest.fn(),
}));

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { generateInvoiceNumber } from '../src/services/invoice.service';

const INVOICE_SVC = readFileSync(
  resolve(__dirname, '../src/services/invoice.service.ts'),
  'utf8',
);
const RECON_SVC = readFileSync(
  resolve(__dirname, '../src/services/reconciliation.service.ts'),
  'utf8',
);
const COMPLIANCE_SVC = readFileSync(
  resolve(__dirname, '../src/services/compliance-admin.service.ts'),
  'utf8',
);
const PHOTO_SVC = readFileSync(
  resolve(__dirname, '../src/services/booking-photo.service.ts'),
  'utf8',
);

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  dbTransactionMock.mockImplementation(async (cb: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cb as any)({
      query: (sql: string, params?: unknown[]) => dbQueryMock(sql, params),
    });
  });
});

// Slice between two markers — robust to nested braces.
function sliceBetween(src: string, startNeedle: string, endNeedle: string): string {
  const start = src.indexOf(startNeedle);
  if (start < 0) return '';
  const end = src.indexOf(endNeedle, start + startNeedle.length);
  return end < 0 ? src.slice(start) : src.slice(start, end);
}

// Strip // line comments so source-shape regexes don't match comment text.
function stripLineComments(src: string): string {
  return src
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

describe('MED-N116 — generateInvoiceNumber uses cryptographic randomness', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('MED-N116 — generates the Manila billing month from crypto.randomBytes without Math.random', () => {
    const randomBytes = jest.fn((size: number) => Buffer.alloc(size, 0));
    const mathRandom = jest.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random must not be used for invoice numbers');
    });

    const number = generateInvoiceNumber(new Date('2026-05-31T17:00:00.000Z'), randomBytes);

    expect(number).toBe('INV-202606-AAAAAA');
    expect(randomBytes).toHaveBeenCalledWith(8);
    expect(mathRandom).not.toHaveBeenCalled();
  });

  it('MED-N116 — emits only unambiguous suffix characters', () => {
    const randomBytes = (size: number): Buffer =>
      Buffer.from([0, 8, 14, 22, 24, 31, 0, 0]).subarray(0, size);

    const number = generateInvoiceNumber(new Date('2026-06-01T00:00:00.000Z'), randomBytes);
    const suffix = number.slice(-6);

    expect(number).toMatch(/^INV-202606-[A-HJ-NP-Z2-9]{6}$/);
    expect(suffix).not.toMatch(/[IO01]/);
  });
});

describe('MED-N119 — reconciliation alert threshold is admin-tunable', () => {
  it('MED-N119 — getAlertThresholdCentavos reads from settings', () => {
    expect(RECON_SVC).toMatch(/function getAlertThresholdCentavos/);
    expect(RECON_SVC).toMatch(/settingsService\.getSetting\('reconciliation_alert_threshold_centavos'\)/);
  });

  it('MED-N119 — falls back to ALERT_THRESHOLD_CENTAVOS constant on read failure', () => {
    // The function ends right before the next "//" section comment.
    const body = sliceBetween(RECON_SVC, 'async function getAlertThresholdCentavos', '// ─');
    expect(body).not.toBe('');
    expect(body).toMatch(/return ALERT_THRESHOLD_CENTAVOS/);
  });

  it('MED-N119 — runDailyReconciliation uses local thresholdCentavos (not the constant) when comparing', () => {
    expect(RECON_SVC).toMatch(/Math\.abs\(discrepancy\) > thresholdCentavos/);
  });
});

describe('MED-N121 — reconciliation snapshot uses single bulk SELECT', () => {
  it('MED-N121 — one query reads all four wallet bucket totals via CASE/COALESCE', () => {
    expect(RECON_SVC).toMatch(/CASE WHEN user_id IS NULL AND type = 'platform_escrow'/);
    expect(RECON_SVC).toMatch(/CASE WHEN user_id IS NOT NULL/);
    expect(RECON_SVC).toMatch(/AS platform_escrow_total/);
    expect(RECON_SVC).toMatch(/AS user_wallets_total/);
  });

  it('MED-N121 — old two-query pattern is gone (no separate platform-totals + user-wallets queries)', () => {
    // The old code had `WHERE user_id IS NULL AND type IN (...)` + GROUP BY.
    expect(RECON_SVC).not.toMatch(/WHERE user_id IS NULL\s*\n?\s*AND type IN \('platform_escrow'/);
  });
});

describe('MED-N122 — DSR mutations wrap UPDATE + audit in single trx', () => {
  it('MED-N122 — requestDsrMoreInfo opens db.transaction', () => {
    const body = sliceBetween(
      COMPLIANCE_SVC,
      'export async function requestDsrMoreInfo',
      'export async function rejectDsr',
    );
    expect(body).not.toBe('');
    expect(body).toMatch(/db\.transaction\(async \(client\)/);
    expect(body).toMatch(/INSERT INTO admin_actions/);
  });

  it('MED-N122 — rejectDsr opens db.transaction', () => {
    const body = sliceBetween(
      COMPLIANCE_SVC,
      'export async function rejectDsr',
      'export async function escalateDsrToNpc',
    );
    expect(body).not.toBe('');
    expect(body).toMatch(/db\.transaction\(async \(client\)/);
    expect(body).toMatch(/INSERT INTO admin_actions/);
  });
});

describe('MED-N123 — NPC reference regex bounds the suffix', () => {
  it('MED-N123 — suffix length is 6-12 chars (not unbounded)', () => {
    expect(COMPLIANCE_SVC).toMatch(/NPC-\\d\{4\}-\[A-Z0-9\]\{6,12\}/);
    expect(COMPLIANCE_SVC).not.toMatch(/NPC-\\d\{4\}-\[A-Z0-9\]\{6,\}\$/);
  });

  it('MED-N123 — error message mentions the bound', () => {
    expect(COMPLIANCE_SVC).toMatch(/6-12 alphanumeric/);
  });
});

describe('MED-N124 — rejectDsr does NOT set completed_at', () => {
  it('MED-N124 — rejectDsr UPDATE does not include completed_at = NOW()', () => {
    const body = sliceBetween(
      COMPLIANCE_SVC,
      'export async function rejectDsr',
      'export async function escalateDsrToNpc',
    );
    expect(body).not.toBe('');
    // Must SET status = 'rejected' but NOT completed_at = NOW().
    // Capture only the UPDATE statement (between UPDATE and RETURNING).
    const updateStmt = sliceBetween(body, 'UPDATE data_subject_requests', 'RETURNING');
    expect(updateStmt).toMatch(/SET status = 'rejected'/);
    expect(updateStmt).not.toMatch(/completed_at = NOW\(\)/);
  });
});

describe('MED-N132 — booking-photo upload + INSERT has saga-compensation cleanup on throw', () => {
  it('MED-N132 — uploadBookingPhoto wraps INSERT in try/catch with deleteUploadedFile on error', () => {
    const body = sliceBetween(
      PHOTO_SVC,
      'export async function uploadBookingPhoto',
      'export interface BookingPhotoListItem',
    );
    expect(body).not.toBe('');
    expect(body).toMatch(/try \{[\s\S]*?INSERT INTO booking_photos/);
    expect(body).toMatch(/catch \(insertErr\)[\s\S]*?deleteUploadedFile/);
    expect(body).toMatch(/throw insertErr;/);
  });

  it('MED-N132 — uploadSignature wraps INSERT in try/catch with deleteUploadedFile on error', () => {
    const body = sliceBetween(PHOTO_SVC, 'export async function uploadSignature', '\n}\n\n');
    expect(body).not.toBe('');
    expect(body).toMatch(/try \{[\s\S]*?INSERT INTO booking_signatures/);
    expect(body).toMatch(/catch \(insertErr\)[\s\S]*?deleteUploadedFile/);
    expect(body).toMatch(/throw insertErr;/);
  });

  it('MED-N132 — cleanup failure is logged at error level (orphan flagged)', () => {
    expect(PHOTO_SVC).toMatch(/cleanup failed after INSERT error[\s\S]*?orphan file/);
  });
});
