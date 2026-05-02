/**
 * Phase 08 — BIR Form 2307 (Certificate of Creditable Tax Withheld at Source)
 * quarterly batch service.
 *
 * Per RR 16-2023, online platforms acting as withholding agents must withhold
 * 1% of a provider's gross income once that provider's YEAR-TO-DATE income
 * from the platform exceeds P500,000 (= 50,000,000 centavos). Only the
 * portion ABOVE the threshold is withheld. This service generates one
 * quarterly batch row per provider that crossed the threshold for the given
 * quarter, idempotent on (provider_id, tax_year, tax_quarter).
 *
 * Caveat: the threshold and rate constants encoded here are the platform's
 * baseline interpretation of RR 16-2023. Authorized accountants must verify
 * each batch and adjust before official BIR submission. The generated PDF is
 * marked DRAFT.
 *
 * Sacred-file note: this service is read-only against `official_receipts`
 * (it sums `provider_received` for the quarter window). It writes only to
 * `bir_2307_batches` and `admin_actions`. Audit-row failures NEVER roll back
 * batch insertions — the batch is the authoritative artifact.
 */

import { Buffer } from 'buffer';
import PDFDocument from 'pdfkit';

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { uploadBirDocument } from '../utils/s3-bir';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface Bir2307Batch {
  id: string;
  providerId: string;
  taxYear: number;
  taxQuarter: 1 | 2 | 3 | 4;
  grossIncome: number;
  withholdingRate: number;
  withheldAmount: number;
  pdfUrl: string | null;
  issuedAt: string;
  providerName?: string;
}

export interface QuarterlyBatchResult {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  batchesCreated: number;
  batchesSkipped: number;
  // MED-N21 fix: surface attempted vs created/failed counts so the
  // operator gets a clear signal that a run was incomplete (e.g.,
  // some providers errored mid-batch). batchesAttempted = number
  // of providers we tried to process (post-threshold-check) =
  // batchesCreated + batchesFailed (batchesSkipped is for providers
  // that already had a batch — different category).
  batchesAttempted: number;
  batchesFailed: number;
  failures: Array<{ providerId: string; error: string }>;
  totalProvidersProcessed: number;
  totalGrossIncome: number;
  totalWithheld: number;
}

interface Bir2307BatchRow {
  id: string;
  provider_id: string;
  tax_year: number;
  tax_quarter: number;
  gross_income: string;
  withholding_rate: string;
  withheld_amount: string;
  pdf_url: string | null;
  issued_at: Date;
  provider_name?: string | null;
}

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

/** P500,000 in centavos — RR 16-2023 platform-withholding threshold. */
const WITHHOLDING_THRESHOLD_CENTAVOS = 50_000_000;
/** Flat 1% creditable withholding rate per RR 16-2023. */
const WITHHOLDING_RATE = 0.01;
const MIN_TAX_YEAR = 2024;
const MAX_TAX_YEAR = 2100;
/** Asia/Manila is UTC+8 with no DST — fixed offset is safe here. */
const PH_TZ_OFFSET_HOURS = 8;

// ─────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────

function assertYearQuarter(year: number, quarter: number): void {
  if (!Number.isInteger(year) || year < MIN_TAX_YEAR || year > MAX_TAX_YEAR) {
    throw createAppError(
      `tax year must be an integer between ${MIN_TAX_YEAR} and ${MAX_TAX_YEAR}.`,
      400,
    );
  }
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
    throw createAppError('tax quarter must be 1, 2, 3, or 4.', 400);
  }
}

/**
 * Compute the inclusive-start / exclusive-end TIMESTAMPTZ window for a tax
 * quarter, treated as Asia/Manila wall time (UTC+8, no DST). Returns ISO
 * strings.
 *
 * Q1 = Jan-Mar, Q2 = Apr-Jun, Q3 = Jul-Sep, Q4 = Oct-Dec. Start is the first
 * instant of the first month at 00:00 PHT; end is 00:00 PHT of the first day
 * of the FOLLOWING quarter (exclusive). Example for Q2 2026:
 *   start = 2026-04-01 00:00 PHT = 2026-03-31T16:00:00.000Z
 *   end   = 2026-07-01 00:00 PHT = 2026-06-30T16:00:00.000Z
 */
export function quarterWindow(
  year: number,
  quarter: 1 | 2 | 3 | 4,
): { startUtc: string; endUtc: string } {
  assertYearQuarter(year, quarter);

  const startMonthIndex = (quarter - 1) * 3; // 0,3,6,9
  const endMonthIndex = startMonthIndex + 3; // 3,6,9,12 (12 -> next year Jan)

  // Asia/Manila 00:00 == UTC (00 - 8) = previous day 16:00.
  // Date.UTC accepts month as 0-indexed and handles month overflow (12 -> next
  // Jan) and day=1, hour=-8 for the wall-time-to-UTC shift.
  const startUtcMs = Date.UTC(year, startMonthIndex, 1, -PH_TZ_OFFSET_HOURS, 0, 0, 0);
  const endUtcMs = Date.UTC(year, endMonthIndex, 1, -PH_TZ_OFFSET_HOURS, 0, 0, 0);

  return {
    startUtc: new Date(startUtcMs).toISOString(),
    endUtc: new Date(endUtcMs).toISOString(),
  };
}

/**
 * Year-to-date window: 00:00 PHT Jan 1 of `year` (inclusive) through end of
 * the given quarter (exclusive). Used for the threshold-crossing check.
 */
function ytdWindowThroughQuarter(
  year: number,
  quarter: 1 | 2 | 3 | 4,
): { startUtc: string; endUtc: string } {
  const yearStartMs = Date.UTC(year, 0, 1, -PH_TZ_OFFSET_HOURS, 0, 0, 0);
  const { endUtc } = quarterWindow(year, quarter);
  return { startUtc: new Date(yearStartMs).toISOString(), endUtc };
}

function mapBatchRow(row: Bir2307BatchRow): Bir2307Batch {
  const taxQuarterNum = Number(row.tax_quarter);
  if (taxQuarterNum !== 1 && taxQuarterNum !== 2 && taxQuarterNum !== 3 && taxQuarterNum !== 4) {
    // Defensive: schema CHECK guarantees 1..4 — narrow the type for callers.
    throw createAppError('Invalid tax_quarter in bir_2307_batches row.', 500);
  }
  const issuedAtRaw = row.issued_at;
  const issuedAt =
    issuedAtRaw instanceof Date
      ? issuedAtRaw.toISOString()
      : String(issuedAtRaw ?? '');
  const providerNameRaw = row.provider_name;
  const batch: Bir2307Batch = {
    id: String(row.id),
    providerId: String(row.provider_id),
    taxYear: Number(row.tax_year),
    taxQuarter: taxQuarterNum,
    grossIncome: Number(row.gross_income),
    withholdingRate: Number(row.withholding_rate),
    withheldAmount: Number(row.withheld_amount),
    pdfUrl: row.pdf_url === null || row.pdf_url === undefined ? null : String(row.pdf_url),
    issuedAt,
  };
  if (typeof providerNameRaw === 'string' && providerNameRaw.length > 0) {
    batch.providerName = providerNameRaw;
  }
  return batch;
}

const BATCH_SELECT = `
  id, provider_id, tax_year, tax_quarter,
  gross_income::text     AS gross_income,
  withholding_rate::text AS withholding_rate,
  withheld_amount::text  AS withheld_amount,
  pdf_url, issued_at
`;

// ─────────────────────────────────────────────────────────────────
// PDF generation
// ─────────────────────────────────────────────────────────────────

interface PdfProvider {
  businessName: string;
  tin?: string | null;
  address?: string | null;
}

const PESO = '\u20B1';

function formatPeso(centavos: number): string {
  const neg = centavos < 0;
  const abs = Math.abs(centavos);
  const pesos = Math.trunc(abs / 100);
  const cents = abs % 100;
  const pesosStr = pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const centsStr = cents.toString().padStart(2, '0');
  return `${neg ? '-' : ''}${PESO}${pesosStr}.${centsStr}`;
}

function formatRatePercent(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

/**
 * Build a structured single-page BIR-2307-style PDF for a batch. This is a
 * draft artifact only — official filings must use BIR-authorized printers.
 */
async function buildBir2307Pdf(
  batch: Bir2307Batch,
  provider: PdfProvider,
  filer: import('./bir-filer-identity.service').BirFilerIdentity,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      // Header
      doc.fontSize(18).text('BIR FORM 2307', { align: 'center' });
      doc
        .fontSize(11)
        .text('Certificate of Creditable Tax Withheld at Source', { align: 'center' });
      doc.moveDown(0.3);
      doc
        .fontSize(10)
        .text(`Period: Q${batch.taxQuarter} ${batch.taxYear}`, { align: 'center' });
      doc.fontSize(9).text(`Issued: ${batch.issuedAt}`, { align: 'center' });
      doc.moveDown(1);

      // CRIT-N03 fix: Withholding agent (payor) block sourced from
      // platform_settings via getBirFilerIdentity().
      doc.fontSize(11).text('Part I — Payor (Withholding Agent)');
      doc.fontSize(9);
      doc.text(`Name: ${filer.companyName}`);
      doc.text(`TIN: ${filer.tin}`);
      doc.text(`Address: ${filer.address}`);
      doc.moveDown(0.7);

      // Payee (provider) block
      doc.fontSize(11).text('Part II — Payee (Income Recipient)');
      doc.fontSize(9);
      doc.text(`Name / Business Name: ${provider.businessName}`);
      doc.text(`TIN: ${provider.tin ?? '[Provider TIN — pending]'}`);
      doc.text(`Address: ${provider.address ?? '[Provider address — pending]'}`);
      doc.moveDown(0.7);

      // Income / withholding block (mimics BIR 2307 Schedule of Income Payments)
      doc.fontSize(11).text('Part III — Income Payments Subject to Withholding');
      doc.fontSize(9);
      doc.text(
        'Nature of Income Payment: Online platform service income (RR 16-2023, ATC WI158).',
      );
      doc.moveDown(0.3);
      doc.text(`Tax Year:                ${batch.taxYear}`);
      doc.text(`Tax Quarter:             Q${batch.taxQuarter}`);
      doc.text(`Gross Income (subject):  ${formatPeso(batch.grossIncome)}`);
      doc.text(`Withholding Rate:        ${formatRatePercent(batch.withholdingRate)}`);
      doc.text(`Tax Withheld:            ${formatPeso(batch.withheldAmount)}`);
      doc.moveDown(1.5);

      // Signatory line
      doc.fontSize(9).text('_______________________________');
      doc.text('Authorized Signatory (Withholding Agent)');
      doc.moveDown(1);

      // Footer
      doc
        .fontSize(8)
        .fillColor('red')
        .text('DRAFT — CONSULT BIR-FORM 2307 AUTHORIZED PRINTER FOR OFFICIAL FILING', {
          align: 'center',
        });
      doc.fillColor('black');

      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Uploads the BIR 2307 batch PDF to the configured S3 bucket with
 * server-side encryption. Returns the canonical URL on success, or null
 * when S3 is not configured (so dev/test environments can still run).
 * Bucket-level hardening (versioning, Object Lock for retention) is
 * managed via infra outside this service — see EVIDENCE-MANIFEST
 * (deferred-to-infra).
 */
async function uploadPdf(
  providerId: string,
  year: number,
  quarter: number,
  pdf: Buffer,
): Promise<string | null> {
  const key = `bir-2307/${year}-Q${quarter}/${providerId}.pdf`;
  const result = await uploadBirDocument(pdf, key, 'application/pdf');
  return result?.url ?? null;
}

// ─────────────────────────────────────────────────────────────────
// Withholding math
// ─────────────────────────────────────────────────────────────────

interface WithholdingComputation {
  withholdable: number;
  withheld: number;
}

/**
 * Apply the RR 16-2023 threshold rule to a provider's quarterly figures.
 *
 * Returns null when no batch should be created (provider has not yet crossed
 * the cumulative P500,000 YTD threshold). Otherwise returns the centavos
 * amount that is subject to the 1% withholding for THIS quarter, plus the
 * rounded withheld amount.
 *
 * Note: per RR 16-2023, accountants must verify the threshold-crossing
 * quarter manually; this function encodes the platform's baseline
 * interpretation only.
 */
function computeWithholding(
  quarterlyIncome: number,
  ytdIncome: number,
): WithholdingComputation | null {
  if (quarterlyIncome <= 0) return null;
  if (ytdIncome <= WITHHOLDING_THRESHOLD_CENTAVOS) return null;

  const priorYtd = ytdIncome - quarterlyIncome;
  let withholdable: number;
  if (priorYtd >= WITHHOLDING_THRESHOLD_CENTAVOS) {
    // Already over the threshold from prior quarters — full quarter is withholdable.
    withholdable = quarterlyIncome;
  } else {
    // This is the threshold-crossing quarter — only the excess above
    // P500,000 is withholdable.
    withholdable = ytdIncome - WITHHOLDING_THRESHOLD_CENTAVOS;
  }
  if (withholdable <= 0) return null;

  const withheld = Math.round(withholdable * WITHHOLDING_RATE);
  return { withholdable, withheld };
}

// ─────────────────────────────────────────────────────────────────
// Income aggregation
// ─────────────────────────────────────────────────────────────────

interface ProviderQuarterlyIncomeRow {
  provider_id: string;
  quarterly_income: string | null;
}

interface ProviderYtdRow {
  provider_id: string;
  ytd_income: string | null;
}

interface ProviderInfoRow {
  id: string;
  business_name: string | null;
  // MED-N20 fix: TIN is now stored on providers (migration 097).
  // Used by generateBir2307Pdf to populate the payee TIN line.
  // Nullable for legacy / pre-launch providers; PDF still renders
  // the "[Provider TIN — pending]" sentinel so the batch job
  // doesn't hard-fail, and admin gets a warning per missing TIN
  // so they can chase the provider for it.
  tin: string | null;
}

/** Sum provider_received per provider for the quarter window (non-cancellation ORs). */
async function aggregateQuarterlyIncome(
  startUtc: string,
  endUtc: string,
): Promise<Map<string, number>> {
  const result = await db.query<ProviderQuarterlyIncomeRow>(
    `SELECT provider_id,
            COALESCE(SUM(provider_received), 0)::text AS quarterly_income
       FROM official_receipts
      WHERE provider_id IS NOT NULL
        AND is_cancellation = FALSE
        AND issued_at >= $1
        AND issued_at <  $2
      GROUP BY provider_id`,
    [startUtc, endUtc],
  );
  const map = new Map<string, number>();
  for (const row of result.rows) {
    const amt = Number(row.quarterly_income ?? 0);
    if (amt > 0) map.set(row.provider_id, amt);
  }
  return map;
}

/** Sum provider_received per provider for the YTD window (non-cancellation ORs). */
async function aggregateYtdIncome(
  startUtc: string,
  endUtc: string,
  providerIds: string[],
): Promise<Map<string, number>> {
  if (providerIds.length === 0) return new Map();
  const result = await db.query<ProviderYtdRow>(
    `SELECT provider_id,
            COALESCE(SUM(provider_received), 0)::text AS ytd_income
       FROM official_receipts
      WHERE provider_id = ANY($1::uuid[])
        AND is_cancellation = FALSE
        AND issued_at >= $2
        AND issued_at <  $3
      GROUP BY provider_id`,
    [providerIds, startUtc, endUtc],
  );
  const map = new Map<string, number>();
  for (const row of result.rows) { // SAFE-N+1: in-memory aggregation of already-fetched rows; no DB calls inside loop body.
    map.set(row.provider_id, Number(row.ytd_income ?? 0));
  }
  return map;
}

async function loadProviderInfo(providerIds: string[]): Promise<Map<string, ProviderInfoRow>> {
  if (providerIds.length === 0) return new Map();
  // MED-N20 fix: also SELECT tin so the BIR 2307 PDF can populate
  // the payee TIN line (was hardcoded "[Provider TIN — pending]").
  const result = await db.query<ProviderInfoRow>(
    `SELECT id, business_name, tin FROM providers WHERE id = ANY($1::uuid[])`,
    [providerIds],
  );
  const map = new Map<string, ProviderInfoRow>();
  for (const row of result.rows) {
    map.set(row.id, row);
    if (!row.tin) {
      logger.warn('Provider missing TIN — BIR 2307 PDF will render placeholder', {
        providerId: row.id,
        businessName: row.business_name,
      });
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────
// Audit + persistence helpers
// ─────────────────────────────────────────────────────────────────

async function writeBatchAuditRow(
  adminId: string | null,
  batch: Bir2307Batch,
  reason: string,
  actionType: 'bir_2307_batch_generated' | 'bir_2307_regenerated',
): Promise<void> {
  try {
    if (actionType === 'bir_2307_batch_generated') {
      // gate-c-allowed: best-effort-audit-only — try/catch'd, logger.warn on failure; BIR batch row already durable
      await db.query(
        `INSERT INTO admin_actions
           (admin_id, action_type, target_type, target_id, reason, details)
         VALUES ($1, 'bir_2307_batch_generated', 'bir_2307_batch', $2, $3, $4::jsonb)`,
        [
          adminId,
          batch.id,
          reason,
          JSON.stringify({
            providerId: batch.providerId,
            taxYear: batch.taxYear,
            taxQuarter: batch.taxQuarter,
            grossIncome: batch.grossIncome,
            withholdingRate: batch.withholdingRate,
            withheldAmount: batch.withheldAmount,
          }),
        ],
      );
    } else {
      // gate-c-allowed: best-effort-audit-only — same try/catch envelope as above
      await db.query(
        `INSERT INTO admin_actions
           (admin_id, action_type, target_type, target_id, reason, details)
         VALUES ($1, 'bir_2307_regenerated', 'bir_2307_batch', $2, $3, $4::jsonb)`,
        [
          adminId,
          batch.id,
          reason,
          JSON.stringify({
            providerId: batch.providerId,
            taxYear: batch.taxYear,
            taxQuarter: batch.taxQuarter,
            grossIncome: batch.grossIncome,
            withholdingRate: batch.withholdingRate,
            withheldAmount: batch.withheldAmount,
          }),
        ],
      );
    }
  } catch (err) {
    logger.warn('Failed to write admin_actions row for BIR 2307 batch', {
      batchId: batch.id,
      providerId: batch.providerId,
      taxYear: batch.taxYear,
      taxQuarter: batch.taxQuarter,
      actionType,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function attachPdfToBatch(
  batch: Bir2307Batch,
  provider: PdfProvider,
): Promise<Bir2307Batch> {
  try {
    // CRIT-N03 fix: load filer identity from platform_settings.
    const { getBirFilerIdentity } = await import('./bir-filer-identity.service');
    const filer = await getBirFilerIdentity();
    const pdf = await buildBir2307Pdf(batch, provider, filer);
    const pdfUrl = await uploadPdf(batch.providerId, batch.taxYear, batch.taxQuarter, pdf);
    if (pdfUrl) {
      const upd = await db.query<Bir2307BatchRow>(
        `UPDATE bir_2307_batches SET pdf_url = $1 WHERE id = $2
         RETURNING ${BATCH_SELECT}`,
        [pdfUrl, batch.id],
      );
      const updated = upd.rows[0];
      if (updated) {
        return mapBatchRow(updated);
      }
    }
  } catch (err) {
    logger.error('BIR 2307 PDF generation failed (batch row already persisted)', {
      batchId: batch.id,
      providerId: batch.providerId,
      taxYear: batch.taxYear,
      taxQuarter: batch.taxQuarter,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return batch;
}

// ─────────────────────────────────────────────────────────────────
// 1) Generate quarterly batches for ALL providers (idempotent)
// ─────────────────────────────────────────────────────────────────

export async function generateQuarterly2307Batches(
  year: number,
  quarter: 1 | 2 | 3 | 4,
): Promise<QuarterlyBatchResult> {
  assertYearQuarter(year, quarter);

  const { startUtc, endUtc } = quarterWindow(year, quarter);
  const ytd = ytdWindowThroughQuarter(year, quarter);

  const quarterlyMap = await aggregateQuarterlyIncome(startUtc, endUtc);
  const providerIds = Array.from(quarterlyMap.keys());

  const result: QuarterlyBatchResult = {
    year,
    quarter,
    batchesCreated: 0,
    batchesSkipped: 0,
    batchesAttempted: 0,
    batchesFailed: 0,
    failures: [],
    totalProvidersProcessed: providerIds.length,
    totalGrossIncome: 0,
    totalWithheld: 0,
  };

  if (providerIds.length === 0) {
    logger.info('No provider income found for BIR 2307 batch generation', {
      year,
      quarter,
      window: { startUtc, endUtc },
    });
    return result;
  }

  const [ytdMap, providerInfoMap] = await Promise.all([
    aggregateYtdIncome(ytd.startUtc, ytd.endUtc, providerIds),
    loadProviderInfo(providerIds),
  ]);

  const reason = `Quarterly auto-generation Q${quarter} ${year}`;

  for (const providerId of providerIds) {
    const quarterlyIncome = quarterlyMap.get(providerId) ?? 0;
    const ytdIncome = ytdMap.get(providerId) ?? 0;
    const computation = computeWithholding(quarterlyIncome, ytdIncome);
    if (!computation) {
      // Provider did not cross the P500,000 YTD threshold — skip per
      // RR 16-2023 (accountant verification still required for edge cases).
      continue;
    }

    // MED-N21 fix: per-provider try/catch. Pre-fix a single
    // provider's failure (DB hiccup, PDF render error, S3 upload
    // throw) crashed the whole loop, leaving downstream providers
    // unprocessed and the operator with no surfaced count of what
    // got done vs not. Now: catch + log + continue, with each
    // failure recorded in result.failures so the caller can decide
    // whether to retry or escalate.
    result.batchesAttempted += 1;
    try {
      // Idempotency: skip if a batch already exists for (provider, year, quarter).
      const existing = await db.query<Bir2307BatchRow>(
        `SELECT ${BATCH_SELECT} FROM bir_2307_batches
          WHERE provider_id = $1 AND tax_year = $2 AND tax_quarter = $3
          LIMIT 1`,
        [providerId, year, quarter],
      );
      if (existing.rows[0]) {
        result.batchesSkipped += 1;
        continue;
      }

      const insertResult = await db.query<Bir2307BatchRow>(
        `INSERT INTO bir_2307_batches
           (provider_id, tax_year, tax_quarter, gross_income, withholding_rate, withheld_amount)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (provider_id, tax_year, tax_quarter) DO NOTHING
         RETURNING ${BATCH_SELECT}`,
        [
          providerId,
          year,
          quarter,
          computation.withholdable,
          WITHHOLDING_RATE,
          computation.withheld,
        ],
      );
      const insertedRow = insertResult.rows[0];
      if (!insertedRow) {
        // Race: another worker created the batch between SELECT and INSERT.
        result.batchesSkipped += 1;
        continue;
      }
      let batch = mapBatchRow(insertedRow);

      const providerInfo = providerInfoMap.get(providerId);
      const providerForPdf: PdfProvider = {
        businessName: providerInfo?.business_name ?? '(Unknown Provider)',
        // MED-N20 fix: pass real TIN through to the PDF builder. Falls
        // back to the placeholder via the `?? '[Provider TIN — pending]'`
        // guard at the doc.text() site if still null.
        tin: providerInfo?.tin ?? null,
      };
      batch = await attachPdfToBatch(batch, providerForPdf);

      await writeBatchAuditRow(null, batch, reason, 'bir_2307_batch_generated');

      result.batchesCreated += 1;
      result.totalGrossIncome += batch.grossIncome;
      result.totalWithheld += batch.withheldAmount;

      logger.info('BIR 2307 batch generated', {
        batchId: batch.id,
        providerId: batch.providerId,
        taxYear: batch.taxYear,
        taxQuarter: batch.taxQuarter,
        grossIncome: batch.grossIncome,
        withheldAmount: batch.withheldAmount,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      result.batchesFailed += 1;
      result.failures.push({ providerId, error: errMsg });
      logger.error('BIR 2307 batch generation failed for provider', {
        providerId, year, quarter, error: errMsg,
      });
      // Continue to next provider — do NOT rethrow.
    }
  }

  const incomplete = result.batchesFailed > 0;
  logger[incomplete ? 'warn' : 'info']('Quarterly BIR 2307 batch generation complete', {
    year,
    quarter,
    batchesCreated: result.batchesCreated,
    batchesSkipped: result.batchesSkipped,
    batchesAttempted: result.batchesAttempted,
    batchesFailed: result.batchesFailed,
    totalProvidersProcessed: result.totalProvidersProcessed,
    totalGrossIncome: result.totalGrossIncome,
    totalWithheld: result.totalWithheld,
    incomplete,
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────
// 2) Regenerate a single provider's batch (admin-driven, force-overwrite)
// ─────────────────────────────────────────────────────────────────

export async function regenerate2307ForProvider(
  providerId: string,
  year: number,
  quarter: 1 | 2 | 3 | 4,
  adminUserId: string,
): Promise<Bir2307Batch> {
  if (!providerId) throw createAppError('providerId is required.', 400);
  if (!adminUserId) throw createAppError('adminUserId is required.', 400);
  assertYearQuarter(year, quarter);

  const { startUtc, endUtc } = quarterWindow(year, quarter);
  const ytd = ytdWindowThroughQuarter(year, quarter);

  const quarterlyResult = await db.query<{ quarterly_income: string | null }>(
    `SELECT COALESCE(SUM(provider_received), 0)::text AS quarterly_income
       FROM official_receipts
      WHERE provider_id = $1
        AND is_cancellation = FALSE
        AND issued_at >= $2
        AND issued_at <  $3`,
    [providerId, startUtc, endUtc],
  );
  const quarterlyIncome = Number(quarterlyResult.rows[0]?.quarterly_income ?? 0);
  if (quarterlyIncome <= 0) {
    throw createAppError(
      'Provider has no income for that quarter — cannot generate empty batch.',
      409,
    );
  }

  const ytdResult = await db.query<{ ytd_income: string | null }>(
    `SELECT COALESCE(SUM(provider_received), 0)::text AS ytd_income
       FROM official_receipts
      WHERE provider_id = $1
        AND is_cancellation = FALSE
        AND issued_at >= $2
        AND issued_at <  $3`,
    [providerId, ytd.startUtc, ytd.endUtc],
  );
  const ytdIncome = Number(ytdResult.rows[0]?.ytd_income ?? 0);

  const computation = computeWithholding(quarterlyIncome, ytdIncome);
  if (!computation) {
    throw createAppError(
      'Provider has not crossed the BIR 2307 withholding threshold for this quarter.',
      409,
    );
  }

  const upserted = await db.transaction(async (client) => {
    const upsertResult = await client.query<Bir2307BatchRow>(
      `INSERT INTO bir_2307_batches
         (provider_id, tax_year, tax_quarter, gross_income, withholding_rate, withheld_amount, pdf_url, issued_at)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, NOW())
       ON CONFLICT (provider_id, tax_year, tax_quarter) DO UPDATE
         SET gross_income     = EXCLUDED.gross_income,
             withholding_rate = EXCLUDED.withholding_rate,
             withheld_amount  = EXCLUDED.withheld_amount,
             pdf_url          = NULL,
             issued_at        = NOW()
       RETURNING ${BATCH_SELECT}`,
      [
        providerId,
        year,
        quarter,
        computation.withholdable,
        WITHHOLDING_RATE,
        computation.withheld,
      ],
    );
    const row = upsertResult.rows[0];
    if (!row) throw createAppError('Failed to upsert BIR 2307 batch.', 500);
    return row;
  });

  let batch = mapBatchRow(upserted);

  const providerInfoMap = await loadProviderInfo([providerId]);
  const providerInfo = providerInfoMap.get(providerId);
  if (!providerInfo) {
    throw createAppError('Provider not found.', 404);
  }
  const providerForPdf: PdfProvider = {
    businessName: providerInfo.business_name ?? '(Unknown Provider)',
    // MED-N20 fix: include TIN on regenerated PDFs too.
    tin: providerInfo.tin ?? null,
  };
  batch = await attachPdfToBatch(batch, providerForPdf);

  const reason = `Admin-triggered regeneration for Q${quarter} ${year}`;
  await writeBatchAuditRow(adminUserId, batch, reason, 'bir_2307_regenerated');

  logger.info('BIR 2307 batch regenerated', {
    batchId: batch.id,
    providerId: batch.providerId,
    taxYear: batch.taxYear,
    taxQuarter: batch.taxQuarter,
    grossIncome: batch.grossIncome,
    withheldAmount: batch.withheldAmount,
    adminUserId,
  });

  return batch;
}

// ─────────────────────────────────────────────────────────────────
// 3) Listing / lookup
// ─────────────────────────────────────────────────────────────────

const BATCH_SELECT_WITH_PROVIDER = `
  b.id,
  b.provider_id,
  b.tax_year,
  b.tax_quarter,
  b.gross_income::text     AS gross_income,
  b.withholding_rate::text AS withholding_rate,
  b.withheld_amount::text  AS withheld_amount,
  b.pdf_url,
  b.issued_at,
  p.business_name          AS provider_name
`;

export async function getBatchById(id: string): Promise<Bir2307Batch | null> {
  if (!id) throw createAppError('id is required.', 400);
  const result = await db.query<Bir2307BatchRow>(
    `SELECT ${BATCH_SELECT_WITH_PROVIDER}
       FROM bir_2307_batches b
       LEFT JOIN providers p ON p.id = b.provider_id
      WHERE b.id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row ? mapBatchRow(row) : null;
}

export async function listBatchesForProvider(
  providerId: string,
  year?: number,
): Promise<Bir2307Batch[]> {
  if (!providerId) throw createAppError('providerId is required.', 400);
  if (year !== undefined) {
    if (!Number.isInteger(year) || year < MIN_TAX_YEAR || year > MAX_TAX_YEAR) {
      throw createAppError(
        `tax year must be an integer between ${MIN_TAX_YEAR} and ${MAX_TAX_YEAR}.`,
        400,
      );
    }
  }

  const params: unknown[] = [providerId];
  let yearClause = '';
  if (year !== undefined) {
    params.push(year);
    yearClause = ` AND b.tax_year = $${params.length}`;
  }

  const result = await db.query<Bir2307BatchRow>(
    `SELECT ${BATCH_SELECT_WITH_PROVIDER}
       FROM bir_2307_batches b
       LEFT JOIN providers p ON p.id = b.provider_id
      WHERE b.provider_id = $1${yearClause}
      ORDER BY b.tax_year DESC, b.tax_quarter DESC`,
    params,
  );
  return result.rows.map((row) => mapBatchRow(row));
}

export async function listBatchesForQuarter(
  year: number,
  quarter: 1 | 2 | 3 | 4,
  limit = 50,
  offset = 0,
): Promise<{ rows: Bir2307Batch[]; total: number }> {
  assertYearQuarter(year, quarter);
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const [rowsResult, totalResult] = await Promise.all([
    db.query<Bir2307BatchRow>(
      `SELECT ${BATCH_SELECT_WITH_PROVIDER}
         FROM bir_2307_batches b
         LEFT JOIN providers p ON p.id = b.provider_id
        WHERE b.tax_year = $1 AND b.tax_quarter = $2
        ORDER BY b.issued_at DESC
        LIMIT $3 OFFSET $4`,
      [year, quarter, safeLimit, safeOffset],
    ),
    db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM bir_2307_batches
        WHERE tax_year = $1 AND tax_quarter = $2`,
      [year, quarter],
    ),
  ]);

  return {
    rows: rowsResult.rows.map((row) => mapBatchRow(row)),
    total: Number(totalResult.rows[0]?.total ?? 0),
  };
}
