/**
 * Phase 08 — Monthly VAT report service (BIR Form 2550M-equivalent).
 * Aggregates non-cancellation official_receipts for an Asia/Manila wall
 * month into vat_monthly_reports. Idempotent until finalized; once
 * finalized_at is non-null the row is locked (409 on regenerate).
 * input_vat=0 (marketplace — accountant overlays before BIR submission).
 * Audit writes wrapped in try/catch so failures never roll back the report.
 */

import { Buffer } from 'buffer';
import PDFDocument from 'pdfkit';

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { uploadBirDocument } from '../utils/s3-bir';

// ─────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────

export interface VatMonthlyReport {
  id: string;
  periodYear: number;
  periodMonth: number;
  totalGrossSales: number;
  outputVat: number;
  inputVat: number;
  vatPayable: number;
  orCount: number;
  pdfUrl: string | null;
  finalizedAt: string | null;
  finalizedBy: string | null;
  generatedAt: string;
}

export interface VatAnnualSummary {
  year: number;
  monthsFinalized: number;
  totalGrossSales: number;
  totalOutputVat: number;
  totalInputVat: number;
  totalVatPayable: number;
  monthly: Array<
    Pick<
      VatMonthlyReport,
      'periodMonth' | 'totalGrossSales' | 'outputVat' | 'vatPayable' | 'finalizedAt'
    >
  >;
}

// ─────────────────────────────────────────────────────────────────
// Internal row shape
// ─────────────────────────────────────────────────────────────────

interface VatMonthlyReportRow {
  id: string;
  period_year: number;
  period_month: number;
  total_gross_sales: string;
  output_vat: string;
  input_vat: string;
  vat_payable: string;
  or_count: number;
  pdf_url: string | null;
  finalized_at: Date | null;
  finalized_by: string | null;
  generated_at: Date;
}

const VAT_SELECT = `
  id, period_year, period_month,
  total_gross_sales::text AS total_gross_sales,
  output_vat::text        AS output_vat,
  input_vat::text         AS input_vat,
  vat_payable::text       AS vat_payable,
  or_count, pdf_url, finalized_at, finalized_by, generated_at
`;

// ─────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────

const MIN_YEAR = 2024;
const MAX_YEAR = 2100;

function validateYearMonth(year: number, month: number): void {
  if (
    !Number.isInteger(year) ||
    year < MIN_YEAR ||
    year > MAX_YEAR
  ) {
    throw createAppError(
      `year must be an integer between ${MIN_YEAR} and ${MAX_YEAR}.`,
      400,
    );
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw createAppError('month must be an integer between 1 and 12.', 400);
  }
}

function validateYear(year: number): void {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw createAppError(
      `year must be an integer between ${MIN_YEAR} and ${MAX_YEAR}.`,
      400,
    );
  }
}

// ─────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────

/** Asia/Manila Y/M for a given Date (en-CA YYYY-MM-DD parts). */
function manilaYearMonth(at: Date): { year: number; month: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(at);
  const yearStr = parts.find((p) => p.type === 'year')?.value ?? '0';
  const monthStr = parts.find((p) => p.type === 'month')?.value ?? '0';
  return { year: Number(yearStr), month: Number(monthStr) };
}

/** [start, end) UTC ISO for the Asia/Manila wall month. PHT = UTC+8. */
function monthWindow(
  year: number,
  month: number,
): { startIso: string; endIso: string } {
  const eightHoursMs = 8 * 60 * 60 * 1000;
  const startUtcMs = Date.UTC(year, month - 1, 1) - eightHoursMs;
  const endUtcMs = Date.UTC(year, month, 1) - eightHoursMs;
  return {
    startIso: new Date(startUtcMs).toISOString(),
    endIso: new Date(endUtcMs).toISOString(),
  };
}

function isFutureMonth(year: number, month: number): boolean {
  const now = manilaYearMonth(new Date());
  if (year > now.year) return true;
  if (year < now.year) return false;
  return month > now.month;
}

function mapReportRow(row: VatMonthlyReportRow): VatMonthlyReport {
  return {
    id: row.id,
    periodYear: Number(row.period_year),
    periodMonth: Number(row.period_month),
    totalGrossSales: Number(row.total_gross_sales),
    outputVat: Number(row.output_vat),
    inputVat: Number(row.input_vat),
    vatPayable: Number(row.vat_payable),
    orCount: Number(row.or_count),
    pdfUrl: row.pdf_url,
    finalizedAt: row.finalized_at ? row.finalized_at.toISOString() : null,
    finalizedBy: row.finalized_by,
    generatedAt: row.generated_at.toISOString(),
  };
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

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function periodLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1] ?? '?'} ${year}`;
}

// ─────────────────────────────────────────────────────────────────
// PDF generation
// ─────────────────────────────────────────────────────────────────

async function buildVatPdf(
  report: VatMonthlyReport,
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
      doc.fontSize(18).text('Monthly VAT Report (BIR Form 2550M-equivalent)', {
        align: 'center',
      });
      doc.moveDown(0.3);
      doc
        .fontSize(12)
        .text(`Period: ${periodLabel(report.periodYear, report.periodMonth)}`, {
          align: 'center',
        });
      doc
        .fontSize(9)
        .text(`Generated: ${report.generatedAt}`, { align: 'center' });
      if (report.finalizedAt) {
        doc.moveDown(0.3);
        doc
          .fontSize(11)
          .fillColor('green')
          .text(`FINALIZED: ${report.finalizedAt}`, { align: 'center' });
        doc.fillColor('black');
      }
      doc.moveDown(1);

      // CRIT-N06 fix: Filer block sourced from platform_settings.
      doc.fontSize(11).text('Filer:');
      doc.fontSize(9).text(filer.companyName);
      doc.text(`TIN: ${filer.tin}`);
      doc.text(`Address: ${filer.address}`);
      doc.text(filer.vatStatus === 'Non-VAT' ? 'Non-VAT Taxpayer' : 'VAT-Registered Taxpayer');
      doc.moveDown(0.7);

      // Totals block
      doc.fontSize(11).text('Sales & Output VAT:');
      doc.fontSize(9);
      doc.text(`Official Receipts Counted:   ${report.orCount}`);
      doc.text(`Total Gross Sales:           ${formatPeso(report.totalGrossSales)}`);
      doc.text(`Output VAT (12%, inclusive): ${formatPeso(report.outputVat)}`);
      doc.moveDown(0.5);

      doc.fontSize(11).text('Input VAT:');
      doc.fontSize(9);
      doc.text(`Creditable Input VAT:        ${formatPeso(report.inputVat)}`);
      doc.text(
        '(Marketplace platform — no platform input VAT tracked at source.',
      );
      doc.text(' Accountant should overlay any creditable input VAT before BIR filing.)');
      doc.moveDown(0.5);

      doc.fontSize(11).text('VAT Payable:');
      doc.fontSize(9);
      doc.text(`Output VAT minus Input VAT:  ${formatPeso(report.vatPayable)}`);
      doc.moveDown(1.5);

      // Signatory line
      doc.fontSize(9).text('_______________________________');
      doc.text('Authorized Signatory / Accountant');
      doc.moveDown(0.5);

      // Footer disclaimer
      doc
        .fontSize(8)
        .fillColor('gray')
        .text(
          'DRAFT — Reviewed by accountant before BIR submission.',
          { align: 'center' },
        );
      doc.fillColor('black');

      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/** Uploads the monthly VAT report PDF to S3 with server-side encryption.
 *  Returns the canonical URL on success, or null when S3 is not configured.
 *  Bucket-level hardening is managed by infra (see EVIDENCE-MANIFEST). */
async function uploadPdf(
  year: number,
  month: number,
  pdf: Buffer,
): Promise<string | null> {
  const key = `vat-reports/${year}-${String(month).padStart(2, '0')}.pdf`;
  const result = await uploadBirDocument(pdf, key, 'application/pdf');
  return result?.url ?? null;
}

// ─────────────────────────────────────────────────────────────────
// 1) Generate (or regenerate) the monthly VAT report
// ─────────────────────────────────────────────────────────────────

interface VatAggregateRow {
  total_gross_sales: string | null;
  output_vat: string | null;
  or_count: string;
}

export async function generateMonthlyVatReport(
  year: number,
  month: number,
  adminUserId?: string | null,
): Promise<VatMonthlyReport> {
  validateYearMonth(year, month);
  if (isFutureMonth(year, month)) {
    throw createAppError('Cannot generate VAT report for future periods', 400);
  }

  // MED-N46 + MED-N47 fix — pre-fix:
  //   1. SELECT existing row for finalized check (line 314)
  //   2. db.query INSERT ... ON CONFLICT DO UPDATE (line 348)
  // Race: between SELECT and INSERT, another concurrent caller could
  //   finalize the row. The INSERT's ON CONFLICT DO UPDATE then
  //   overwrites the finalized data without the finalized check.
  // Plus the upsert sets pdf_url = NULL during regen, so even within
  //   the same trx the PDF link is stale until the next ship.
  //
  // Post-fix:
  //   - Both the SELECT FOR UPDATE and the upsert run inside ONE
  //     db.transaction so the row is locked between the check and the
  //     upsert. Concurrent callers serialize on FOR UPDATE.
  //   - The upsert WHERE clause adds AND finalized_at IS NULL, so even
  //     if a concurrent caller finalized between our SELECT and the
  //     upsert (impossible with FOR UPDATE, but defense-in-depth), the
  //     UPDATE no-ops.
  //   - pdf_url is no longer NULLed during regen — keep the previous
  //     PDF URL until the new one is generated and patched in via
  //     setVatReportPdfUrl.
  const { startIso, endIso } = monthWindow(year, month);

  const trxResult = await db.transaction(async (client) => {
    // Lock the row if it exists; concurrent callers wait.
    const existing = await client.query<VatMonthlyReportRow>(
      `SELECT ${VAT_SELECT}
         FROM vat_monthly_reports
        WHERE period_year = $1 AND period_month = $2
        FOR UPDATE`,
      [year, month],
    );
    const existingRow = existing.rows[0];
    if (existingRow && existingRow.finalized_at !== null) {
      throw createAppError(
        `VAT report for ${year}-${String(month).padStart(2, '0')} is finalized; cannot regenerate.`,
        409,
      );
    }

    const agg = await client.query<VatAggregateRow>(
      `SELECT
          COALESCE(SUM(gross_amount), 0)::text AS total_gross_sales,
          COALESCE(SUM(vat_amount), 0)::text   AS output_vat,
          COUNT(*)::text                        AS or_count
         FROM official_receipts
        WHERE is_cancellation = FALSE
          AND issued_at >= $1::timestamptz
          AND issued_at <  $2::timestamptz`,
      [startIso, endIso],
    );
    const a = agg.rows[0];
    const totalGrossSales = a ? Number(a.total_gross_sales ?? 0) : 0;
    const outputVat = a ? Number(a.output_vat ?? 0) : 0;
    const orCount = a ? Number(a.or_count) : 0;
    const inputVat = 0;
    const vatPayable = outputVat - inputVat;

    const upserted = await client.query<VatMonthlyReportRow>(
      `INSERT INTO vat_monthly_reports (
          period_year, period_month,
          total_gross_sales, output_vat, input_vat, vat_payable,
          or_count, generated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (period_year, period_month) DO UPDATE
         SET total_gross_sales = EXCLUDED.total_gross_sales,
             output_vat        = EXCLUDED.output_vat,
             input_vat         = EXCLUDED.input_vat,
             vat_payable       = EXCLUDED.vat_payable,
             or_count          = EXCLUDED.or_count,
             generated_at      = NOW()
         WHERE vat_monthly_reports.finalized_at IS NULL
       RETURNING ${VAT_SELECT}`,
      [year, month, totalGrossSales, outputVat, inputVat, vatPayable, orCount],
    );
    return {
      upsertedRow: upserted.rows[0],
      existingRow,
      totalGrossSales,
      outputVat,
      vatPayable,
      orCount,
    };
  });
  const { upsertedRow, existingRow, totalGrossSales, outputVat, vatPayable, orCount } = trxResult;
  const inputVat = 0; // Currently always 0 — moved out of the trx for outer-scope use.
  if (!upsertedRow) {
    throw createAppError('Failed to upsert VAT monthly report.', 500);
  }
  const report = mapReportRow(upsertedRow);

  // CRIT-N06 fix: load filer identity from platform_settings before
  // building the PDF. Throws if any required field is __UNSET__ —
  // failing closed is the right behavior for a BIR-bound document
  // (better to abort report generation than ship placeholders).
  const { getBirFilerIdentity } = await import('./bir-filer-identity.service');
  const filer = await getBirFilerIdentity();

  // Best-effort PDF build + upload — outside any transaction so a PDF
  // failure cannot lose the report row.
  try {
    const pdf = await buildVatPdf(report, filer);
    const pdfUrl = await uploadPdf(year, month, pdf);
    if (pdfUrl) {
      const upd = await db.query<VatMonthlyReportRow>(
        `UPDATE vat_monthly_reports
            SET pdf_url = $1
          WHERE id = $2
          RETURNING ${VAT_SELECT}`,
        [pdfUrl, report.id],
      );
      const updated = upd.rows[0];
      if (updated) {
        Object.assign(report, mapReportRow(updated));
      }
    }
  } catch (err) {
    logger.error('VAT report PDF generation failed (report row already persisted)', {
      reportId: report.id,
      year,
      month,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Audit — system (cron) issuance has admin_id NULL, manual carries adminUserId.
  // gate-c-allowed: best-effort-audit-only — try/catch'd, VAT report row durable from prior write
  try {
    await db.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, reason, details)
       VALUES ($1, 'vat_report_generated', 'vat_report', $2, $3, $4::jsonb)`,
      [
        adminUserId ?? null,
        report.id,
        adminUserId ? 'manual VAT report generation' : 'auto VAT report generation (cron)',
        JSON.stringify({
          periodYear: year,
          periodMonth: month,
          totalGrossSales,
          outputVat,
          inputVat,
          vatPayable,
          orCount,
          regenerated: existingRow !== undefined,
        }),
      ],
    );
  } catch (err) {
    logger.warn('Failed to write admin_actions row for VAT report generation', {
      reportId: report.id,
      year,
      month,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info('VAT report generated', {
    reportId: report.id,
    year,
    month,
    totalGrossSales,
    outputVat,
    vatPayable,
    orCount,
    regenerated: existingRow !== undefined,
    adminUserId: adminUserId ?? null,
  });

  return report;
}

// ─────────────────────────────────────────────────────────────────
// 2) Finalize a monthly VAT report (locks it)
// ─────────────────────────────────────────────────────────────────

export async function finalizeVatReport(
  year: number,
  month: number,
  adminUserId: string,
): Promise<VatMonthlyReport> {
  validateYearMonth(year, month);
  if (!adminUserId) {
    throw createAppError('adminUserId is required.', 400);
  }

  const existing = await db.query<VatMonthlyReportRow>(
    `SELECT ${VAT_SELECT}
       FROM vat_monthly_reports
      WHERE period_year = $1 AND period_month = $2`,
    [year, month],
  );
  const existingRow = existing.rows[0];
  if (!existingRow) {
    throw createAppError(
      `VAT report for ${year}-${String(month).padStart(2, '0')} not found; generate it first.`,
      404,
    );
  }
  if (existingRow.finalized_at !== null) {
    throw createAppError(
      `VAT report for ${year}-${String(month).padStart(2, '0')} is already finalized.`,
      409,
    );
  }

  const updated = await db.query<VatMonthlyReportRow>(
    `UPDATE vat_monthly_reports
        SET finalized_at = NOW(),
            finalized_by = $1
      WHERE id = $2
        AND finalized_at IS NULL
      RETURNING ${VAT_SELECT}`,
    [adminUserId, existingRow.id],
  );
  const updatedRow = updated.rows[0];
  if (!updatedRow) {
    // Lost a race with another finalize call.
    throw createAppError(
      `VAT report for ${year}-${String(month).padStart(2, '0')} is already finalized.`,
      409,
    );
  }
  const report = mapReportRow(updatedRow);

  // gate-c-allowed: best-effort-audit-only — try/catch'd, VAT report row durable from prior UPDATE
  try {
    await db.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, reason, details)
       VALUES ($1, 'vat_report_finalized', 'vat_report', $2, $3, $4::jsonb)`,
      [
        adminUserId,
        report.id,
        'VAT report finalized — locked from regeneration',
        JSON.stringify({
          periodYear: year,
          periodMonth: month,
          totalGrossSales: report.totalGrossSales,
          outputVat: report.outputVat,
          inputVat: report.inputVat,
          vatPayable: report.vatPayable,
          orCount: report.orCount,
        }),
      ],
    );
  } catch (err) {
    logger.warn('Failed to write admin_actions row for VAT report finalization', {
      reportId: report.id,
      year,
      month,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info('VAT report finalized', {
    reportId: report.id,
    year,
    month,
    adminUserId,
  });

  return report;
}

// ─────────────────────────────────────────────────────────────────
// 3) Lookup
// ─────────────────────────────────────────────────────────────────

export async function getVatReport(
  year: number,
  month: number,
): Promise<VatMonthlyReport | null> {
  validateYearMonth(year, month);
  const result = await db.query<VatMonthlyReportRow>(
    `SELECT ${VAT_SELECT}
       FROM vat_monthly_reports
      WHERE period_year = $1 AND period_month = $2`,
    [year, month],
  );
  const row = result.rows[0];
  return row ? mapReportRow(row) : null;
}

export async function listVatReports(
  year?: number,
  limit?: number,
  offset?: number,
): Promise<{ rows: VatMonthlyReport[]; total: number }> {
  if (year !== undefined) validateYear(year);

  const safeLimit =
    limit === undefined
      ? 50
      : Math.max(1, Math.min(500, Math.trunc(limit)));
  const safeOffset =
    offset === undefined ? 0 : Math.max(0, Math.trunc(offset));

  const where: string[] = [];
  const params: unknown[] = [];
  if (year !== undefined) {
    params.push(year);
    where.push(`period_year = $${params.length}`);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const totalResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM vat_monthly_reports ${whereSql}`,
    params,
  );
  const total = Number(totalResult.rows[0]?.count ?? 0);

  params.push(safeLimit);
  const limitIdx = params.length;
  params.push(safeOffset);
  const offsetIdx = params.length;

  const result = await db.query<VatMonthlyReportRow>(
    `SELECT ${VAT_SELECT}
       FROM vat_monthly_reports
       ${whereSql}
      ORDER BY period_year DESC, period_month DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );

  return { rows: result.rows.map(mapReportRow), total }; // SAFE-N+1: in-memory row-to-DTO mapping of LIMIT-paginated result; no DB calls inside map.
}

// ─────────────────────────────────────────────────────────────────
// 4) Annual VAT summary (computed on the fly from finalized monthlies)
// ─────────────────────────────────────────────────────────────────

export async function getAnnualVatSummary(year: number): Promise<VatAnnualSummary> {
  validateYear(year);

  const result = await db.query<VatMonthlyReportRow>(
    `SELECT ${VAT_SELECT}
       FROM vat_monthly_reports
      WHERE period_year = $1
        AND finalized_at IS NOT NULL
      ORDER BY period_month ASC`,
    [year],
  );

  let totalGrossSales = 0;
  let totalOutputVat = 0;
  let totalInputVat = 0;
  let totalVatPayable = 0;
  const monthly: VatAnnualSummary['monthly'] = [];

  for (const row of result.rows) {
    const r = mapReportRow(row);
    totalGrossSales += r.totalGrossSales;
    totalOutputVat += r.outputVat;
    totalInputVat += r.inputVat;
    totalVatPayable += r.vatPayable;
    monthly.push({
      periodMonth: r.periodMonth,
      totalGrossSales: r.totalGrossSales,
      outputVat: r.outputVat,
      vatPayable: r.vatPayable,
      finalizedAt: r.finalizedAt,
    });
  }

  return {
    year,
    monthsFinalized: monthly.length,
    totalGrossSales,
    totalOutputVat,
    totalInputVat,
    totalVatPayable,
    monthly,
  };
}
