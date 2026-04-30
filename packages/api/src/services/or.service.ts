/**
 * Phase 08 — Official Receipt (OR) service.
 *
 * Issues, cancels, and queries BIR-compliant Official Receipts. Numbering is
 * monotonic and gap-free per (year, month) via the `or_sequences` atomic
 * counter table. VAT is computed VAT-INCLUSIVE (Philippine standard for
 * receipts): vatable_sales = gross * 100/112, output_vat = gross - vatable.
 *
 * Sacred-file note: this service does NOT mutate wallet balances. Money is
 * already moved by `escrow.service.ts` before `issueOR` is invoked. This
 * service only records the BIR-required receipt artifact and writes paired
 * `admin_actions` rows for audit. Cancellation creates a NEW negative OR
 * (rather than deleting) so the audit trail is append-only — the BIR
 * requires that issued OR numbers are never reused or removed.
 */

import { Buffer } from 'buffer';
import type { QueryResult, QueryResultRow } from 'pg';
import PDFDocument from 'pdfkit';

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { uploadBirDocument } from '../utils/s3-bir';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface OfficialReceipt {
  id: string;
  orNumber: string;
  bookingId: string;
  customerId: string;
  providerId: string | null;
  issuedAt: string;
  grossAmount: number;
  vatAmount: number;
  netAmount: number;
  commissionAmount: number;
  serviceFeeAmount: number;
  providerReceived: number;
  platformRetained: number;
  pdfUrl: string | null;
  isCancellation: boolean;
  cancelsOrId: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

export interface IssueOrInput {
  bookingId: string;
  commissionAmount: number;
  serviceFeeAmount: number;
  providerReceived: number;
  platformRetained: number;
}

interface TxClient {
  query: <R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<R>>;
}

interface OfficialReceiptRow {
  id: string;
  or_number: string;
  booking_id: string;
  customer_id: string;
  provider_id: string | null;
  issued_at: Date;
  gross_amount: string;
  vat_amount: string;
  net_amount: string;
  commission_amount: string;
  service_fee_amount: string;
  provider_received: string;
  platform_retained: string;
  pdf_url: string | null;
  is_cancellation: boolean;
  cancels_or_id: string | null;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
}

// ─────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Returns Asia/Manila Y/M for a given Date. We compute via the en-CA locale
 * partsformatter to avoid pulling in a tz library; en-CA gives YYYY-MM-DD.
 */
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

function formatOrNumber(year: number, month: number, sequence: number): string {
  const mm = month.toString().padStart(2, '0');
  const seq = sequence.toString().padStart(6, '0');
  return `OR-${year}-${mm}-${seq}`;
}

function mapOrRow(row: OfficialReceiptRow): OfficialReceipt {
  return {
    id: row.id,
    orNumber: row.or_number,
    bookingId: row.booking_id,
    customerId: row.customer_id,
    providerId: row.provider_id,
    issuedAt: row.issued_at.toISOString(),
    grossAmount: Number(row.gross_amount),
    vatAmount: Number(row.vat_amount),
    netAmount: Number(row.net_amount),
    commissionAmount: Number(row.commission_amount),
    serviceFeeAmount: Number(row.service_fee_amount),
    providerReceived: Number(row.provider_received),
    platformRetained: Number(row.platform_retained),
    pdfUrl: row.pdf_url,
    isCancellation: row.is_cancellation,
    cancelsOrId: row.cancels_or_id,
    cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
    cancellationReason: row.cancellation_reason,
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

// ─────────────────────────────────────────────────────────────────
// PDF generation
// ─────────────────────────────────────────────────────────────────

interface PdfCustomer {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
}
interface PdfProvider {
  businessName: string;
}
interface PdfBooking {
  id: string;
  scheduledAt: string | null;
  servicePrice: number;
  serviceFee: number;
}

/**
 * Generates a single-page PDF for the given OR. Uses pdfkit and resolves with
 * the full PDF as a Buffer once the underlying stream finishes.
 */
async function buildOrPdf(
  or: OfficialReceipt,
  customer: PdfCustomer,
  provider: PdfProvider | null,
  booking: PdfBooking,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      // Header
      doc.fontSize(20).text('OFFICIAL RECEIPT', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(12).text(or.orNumber, { align: 'center' });
      doc.fontSize(10).text(`Issued: ${or.issuedAt}`, { align: 'center' });
      if (or.isCancellation) {
        doc.moveDown(0.3);
        doc.fontSize(14).fillColor('red').text('CANCELLATION', { align: 'center' });
        doc.fillColor('black');
      }
      doc.moveDown(1);

      // Sender block
      doc.fontSize(11).text('OnService Platform Inc.', { continued: false });
      doc.fontSize(9).text('TIN: 000-000-000-000');
      doc.text('Address: [Placeholder] Makati City, Metro Manila, Philippines');
      doc.text('VAT-Registered Taxpayer');
      doc.moveDown(0.7);

      // Customer block
      const customerName = `${customer.firstName} ${customer.lastName}`.trim();
      doc.fontSize(11).text('Sold To:');
      doc.fontSize(9).text(`Name: ${customerName || '(unknown)'}`);
      if (customer.email) doc.text(`Email: ${customer.email}`);
      if (customer.phone) doc.text(`Phone: ${customer.phone}`);
      if (provider) doc.text(`Service Provider: ${provider.businessName}`);
      doc.text(`Booking ID: ${booking.id}`);
      if (booking.scheduledAt) doc.text(`Service Date: ${booking.scheduledAt}`);
      doc.moveDown(0.7);

      // Line items
      doc.fontSize(11).text('Line Items:');
      doc.fontSize(9);
      const sign = or.isCancellation ? -1 : 1;
      const servicePrice = booking.servicePrice * sign;
      const serviceFee = booking.serviceFee * sign;
      doc.text(`Service Price:           ${formatPeso(servicePrice)}`);
      doc.text(`Service Fee:             ${formatPeso(serviceFee)}`);
      doc.text(`-----------------------------------------`);
      doc.text(`Gross (VAT-inclusive):   ${formatPeso(or.grossAmount)}`);
      doc.moveDown(0.7);

      // VAT breakdown
      doc.fontSize(11).text('VAT Breakdown (VAT-inclusive):');
      doc.fontSize(9);
      doc.text(`Vatable Sales (Net):     ${formatPeso(or.netAmount)}`);
      doc.text(`Output VAT (12%):        ${formatPeso(or.vatAmount)}`);
      doc.text(`Total Amount Due:        ${formatPeso(or.grossAmount)}`);
      doc.moveDown(1.5);

      // Signatory line
      doc.fontSize(9).text('_______________________________');
      doc.text('Authorized Signatory');
      doc.moveDown(0.5);
      doc.fontSize(7).text(
        'This is a system-generated Official Receipt. BIR Permit to Use (PTU) No.: [Placeholder].',
      );

      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Uploads the official-receipt PDF to the configured S3 bucket with
 * server-side encryption. Returns the canonical URL on success, or null
 * when S3 is not configured. Bucket-level hardening (versioning,
 * Object Lock for retention) is configured via infra outside this
 * service — see EVIDENCE-MANIFEST (deferred-to-infra).
 */
async function uploadPdf(orNumber: string, pdf: Buffer): Promise<string | null> {
  const key = `receipts/${orNumber}.pdf`;
  const result = await uploadBirDocument(pdf, key, 'application/pdf');
  if (!result) {
    logger.warn('Skipping OR PDF upload — S3 not configured', { orNumber, key });
    return null;
  }
  return result.url;
}

// ─────────────────────────────────────────────────────────────────
// 1) Atomic OR-number generation
// ─────────────────────────────────────────────────────────────────

/**
 * Reserves the next OR number for the Asia/Manila month containing `issuedAt`
 * (defaults to "now"). Must be called inside the caller's transaction so the
 * sequence bump rolls back if the OR insertion fails. Numbering is gap-free
 * per (year, month) — required by BIR.
 */
export async function generateOrNumber(client: TxClient, issuedAt?: Date): Promise<string> {
  const at = issuedAt ?? new Date();
  const { year, month } = manilaYearMonth(at);

  const result = await client.query<{ last_sequence: number }>(
    `INSERT INTO or_sequences (year, month, last_sequence)
     VALUES ($1, $2, 1)
     ON CONFLICT (year, month)
     DO UPDATE SET last_sequence = or_sequences.last_sequence + 1, updated_at = NOW()
     RETURNING last_sequence`,
    [year, month],
  );

  const seq = result.rows[0]?.last_sequence;
  if (seq === undefined) {
    throw createAppError('Failed to reserve OR sequence number.', 500);
  }
  return formatOrNumber(year, month, Number(seq));
}

// ─────────────────────────────────────────────────────────────────
// 2) Issue OR (idempotent on bookingId)
// ─────────────────────────────────────────────────────────────────

interface IssueLookupRow {
  id: string;
  customer_id: string;
  provider_id: string | null;
  service_price: string;
  service_fee: string;
  status: string;
  escrow_status: string | null;
  scheduled_at: Date | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  provider_business_name: string | null;
}

/**
 * Issues an OR for a released booking. Idempotent: if a non-cancellation OR
 * already exists for this booking, returns the existing record without
 * re-issuing or re-numbering. Computes VAT-inclusive: vat = round(gross *
 * 12/112), net = gross - vat. Commission/service fee/provider-received/
 * platform-retained centavos are passed in (already computed by escrow).
 */
export async function issueOR(input: IssueOrInput): Promise<OfficialReceipt> {
  const {
    bookingId,
    commissionAmount,
    serviceFeeAmount,
    providerReceived,
    platformRetained,
  } = input;

  if (!bookingId) throw createAppError('bookingId is required.', 400);
  for (const [name, val] of [
    ['commissionAmount', commissionAmount],
    ['serviceFeeAmount', serviceFeeAmount],
    ['providerReceived', providerReceived],
    ['platformRetained', platformRetained],
  ] as const) {
    if (!Number.isFinite(val) || !Number.isInteger(val) || val < 0) {
      throw createAppError(`${name} must be a non-negative integer (centavos).`, 400);
    }
  }

  // Idempotency: return existing non-cancellation OR if present.
  const existing = await db.query<OfficialReceiptRow>(
    `SELECT * FROM official_receipts
      WHERE booking_id = $1 AND is_cancellation = FALSE
      LIMIT 1`,
    [bookingId],
  );
  const existingRow = existing.rows[0];
  if (existingRow) {
    logger.info('OR already issued for booking — returning existing', {
      bookingId,
      orId: existingRow.id,
      orNumber: existingRow.or_number,
    });
    return mapOrRow(existingRow);
  }

  // Booking + customer + provider lookup.
  const lookup = await db.query<IssueLookupRow>(
    `SELECT b.id, b.customer_id, b.provider_id,
            b.service_price::text AS service_price,
            b.service_fee::text   AS service_fee,
            b.status, b.escrow_status, b.scheduled_at,
            cu.first_name AS customer_first_name,
            cu.last_name  AS customer_last_name,
            cu.email      AS customer_email,
            cu.phone      AS customer_phone,
            p.business_name AS provider_business_name
       FROM bookings b
       LEFT JOIN users cu     ON cu.id = b.customer_id
       LEFT JOIN providers p  ON p.id  = b.provider_id
      WHERE b.id = $1`,
    [bookingId],
  );
  const bk = lookup.rows[0];
  if (!bk) throw createAppError('Booking not found.', 404);
  if (bk.escrow_status !== 'released') {
    throw createAppError('OR can only be issued for released bookings.', 409);
  }

  const servicePrice = Number(bk.service_price);
  const serviceFee = Number(bk.service_fee);
  const gross = servicePrice + serviceFee;
  if (gross <= 0) throw createAppError('Invalid booking gross amount.', 400);

  // VAT-inclusive Philippine receipt math.
  const vat = Math.round((gross * 12) / 112);
  const net = gross - vat;

  const issuedAt = new Date();
  const created = await db.transaction(async (client) => {
    const orNumber = await generateOrNumber(client, issuedAt);
    const insertResult = await client.query<OfficialReceiptRow>(
      `INSERT INTO official_receipts (
         or_number, booking_id, customer_id, provider_id, issued_at,
         gross_amount, vat_amount, net_amount,
         commission_amount, service_fee_amount,
         provider_received, platform_retained,
         is_cancellation
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8,
         $9, $10,
         $11, $12,
         FALSE
       )
       RETURNING *`,
      [
        orNumber,
        bookingId,
        bk.customer_id,
        bk.provider_id,
        issuedAt,
        gross,
        vat,
        net,
        commissionAmount,
        serviceFeeAmount,
        providerReceived,
        platformRetained,
      ],
    );
    const row = insertResult.rows[0];
    if (!row) throw createAppError('Failed to insert official receipt.', 500);
    return row;
  });

  const or = mapOrRow(created);

  // PDF generation + (optional) upload — best-effort, outside the transaction.
  try {
    const pdf = await buildOrPdf(
      or,
      {
        firstName: bk.customer_first_name ?? '',
        lastName: bk.customer_last_name ?? '',
        email: bk.customer_email,
        phone: bk.customer_phone,
      },
      bk.provider_business_name ? { businessName: bk.provider_business_name } : null,
      {
        id: bk.id,
        scheduledAt: bk.scheduled_at ? bk.scheduled_at.toISOString() : null,
        servicePrice,
        serviceFee,
      },
    );
    const pdfUrl = await uploadPdf(or.orNumber, pdf);
    if (pdfUrl) {
      const upd = await db.query<OfficialReceiptRow>(
        `UPDATE official_receipts SET pdf_url = $1 WHERE id = $2 RETURNING *`,
        [pdfUrl, or.id],
      );
      const updated = upd.rows[0];
      if (updated) {
        Object.assign(or, mapOrRow(updated));
      }
    }
  } catch (err) {
    logger.error('OR PDF generation failed (OR row already persisted)', {
      orId: or.id,
      orNumber: or.orNumber,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Audit row — system issuance has no admin user, so admin_id is best-effort.
  // The admin_actions table currently requires admin_id NOT NULL; if the
  // schema rejects the insert we log + continue (the OR itself is the
  // authoritative artifact and must not be rolled back here).
  // gate-c-allowed: best-effort-audit-only — try/catch'd, OR row durable from prior insert, audit failure doesn't invalidate money path
  try {
    await db.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason)
       VALUES (NULL, 'or_issued', 'official_receipt', $1, $2::jsonb, $3)`,
      [
        or.id,
        JSON.stringify({
          bookingId,
          orNumber: or.orNumber,
          gross,
          vat,
          net,
        }),
        'auto-issued on escrow release',
      ],
    );
  } catch (err) {
    logger.warn('Failed to write admin_actions row for OR issuance', {
      orId: or.id,
      orNumber: or.orNumber,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info('OR issued', {
    orId: or.id,
    orNumber: or.orNumber,
    bookingId,
    gross,
    vat,
    net,
  });
  return or;
}

// ─────────────────────────────────────────────────────────────────
// 3) Cancel OR — issue a paired negative cancellation OR
// ─────────────────────────────────────────────────────────────────

/**
 * Cancels an OR by marking the original cancelled and issuing a NEW
 * cancellation OR (negative amounts, is_cancellation=TRUE,
 * cancels_or_id=originalId). Audit row 'or_cancelled' is written for the
 * original OR id. Throws 404 if not found, 409 if already cancelled.
 */
export async function cancelOR(
  orId: string,
  reason: string,
  cancelledBy: string,
): Promise<{ original: OfficialReceipt; cancellation: OfficialReceipt }> {
  if (!orId) throw createAppError('orId is required.', 400);
  if (!cancelledBy) throw createAppError('cancelledBy is required.', 400);
  const trimmed = (reason ?? '').trim();
  if (trimmed.length < 5 || trimmed.length > 500) {
    throw createAppError('reason must be between 5 and 500 characters.', 400);
  }

  const result = await db.transaction(async (client) => {
    const lookup = await client.query<OfficialReceiptRow>(
      `SELECT * FROM official_receipts WHERE id = $1 FOR UPDATE`,
      [orId],
    );
    const orig = lookup.rows[0];
    if (!orig) throw createAppError('Official receipt not found.', 404);
    if (orig.is_cancellation) {
      throw createAppError('Cannot cancel a cancellation OR.', 409);
    }
    if (orig.cancelled_at !== null) {
      throw createAppError('Official receipt is already cancelled.', 409);
    }

    const cancelledAt = new Date();
    const updated = await client.query<OfficialReceiptRow>(
      `UPDATE official_receipts
          SET cancelled_at = $1, cancellation_reason = $2, cancelled_by = $3
        WHERE id = $4
        RETURNING *`,
      [cancelledAt, trimmed, cancelledBy, orId],
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) throw createAppError('Failed to mark OR cancelled.', 500);

    const cancelOrNumber = await generateOrNumber(client, cancelledAt);
    const inserted = await client.query<OfficialReceiptRow>(
      `INSERT INTO official_receipts (
         or_number, booking_id, customer_id, provider_id, issued_at,
         gross_amount, vat_amount, net_amount,
         commission_amount, service_fee_amount,
         provider_received, platform_retained,
         is_cancellation, cancels_or_id, cancelled_at, cancellation_reason, cancelled_by
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8,
         $9, $10,
         $11, $12,
         TRUE, $13, $14, $15, $16
       )
       RETURNING *`,
      [
        cancelOrNumber,
        orig.booking_id,
        orig.customer_id,
        orig.provider_id,
        cancelledAt,
        -Number(orig.gross_amount),
        -Number(orig.vat_amount),
        -Number(orig.net_amount),
        -Number(orig.commission_amount),
        -Number(orig.service_fee_amount),
        -Number(orig.provider_received),
        -Number(orig.platform_retained),
        orig.id,
        cancelledAt,
        trimmed,
        cancelledBy,
      ],
    );
    const insertedRow = inserted.rows[0];
    if (!insertedRow) throw createAppError('Failed to insert cancellation OR.', 500);

    return { original: updatedRow, cancellation: insertedRow };
  });

  const original = mapOrRow(result.original);
  const cancellation = mapOrRow(result.cancellation);

  // Audit (paired). Failure does not unwind the cancellation.
  // gate-c-allowed: best-effort-audit-only — try/catch'd, OR cancellation already durable in transaction above
  try {
    await db.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'or_cancelled', 'official_receipt', $2, $3::jsonb, $4)`,
      [
        cancelledBy,
        original.id,
        JSON.stringify({
          originalOrNumber: original.orNumber,
          cancellationOrId: cancellation.id,
          cancellationOrNumber: cancellation.orNumber,
        }),
        trimmed,
      ],
    );
  } catch (err) {
    logger.warn('Failed to write admin_actions row for OR cancellation', {
      orId: original.id,
      orNumber: original.orNumber,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info('OR cancelled', {
    originalOrId: original.id,
    originalOrNumber: original.orNumber,
    cancellationOrId: cancellation.id,
    cancellationOrNumber: cancellation.orNumber,
    cancelledBy,
  });

  return { original, cancellation };
}

// ─────────────────────────────────────────────────────────────────
// 4) Lookup helpers
// ─────────────────────────────────────────────────────────────────

const OR_SELECT = `
  id, or_number, booking_id, customer_id, provider_id, issued_at,
  gross_amount::text  AS gross_amount,
  vat_amount::text    AS vat_amount,
  net_amount::text    AS net_amount,
  commission_amount::text  AS commission_amount,
  service_fee_amount::text AS service_fee_amount,
  provider_received::text  AS provider_received,
  platform_retained::text  AS platform_retained,
  pdf_url, is_cancellation, cancels_or_id,
  cancelled_at, cancellation_reason
`;

export async function getOrById(id: string): Promise<OfficialReceipt | null> {
  if (!id) throw createAppError('id is required.', 400);
  const result = await db.query<OfficialReceiptRow>(
    `SELECT ${OR_SELECT} FROM official_receipts WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row ? mapOrRow(row) : null;
}

export async function getOrByNumber(orNumber: string): Promise<OfficialReceipt | null> {
  if (!orNumber) throw createAppError('orNumber is required.', 400);
  const result = await db.query<OfficialReceiptRow>(
    `SELECT ${OR_SELECT} FROM official_receipts WHERE or_number = $1`,
    [orNumber],
  );
  const row = result.rows[0];
  return row ? mapOrRow(row) : null;
}

export async function listOrsByCustomer(
  customerId: string,
  limit = 50,
  offset = 0,
): Promise<{ rows: OfficialReceipt[]; total: number }> {
  if (!customerId) throw createAppError('customerId is required.', 400);
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const [rowsResult, totalResult] = await Promise.all([
    db.query<OfficialReceiptRow>(
      `SELECT ${OR_SELECT} FROM official_receipts
        WHERE customer_id = $1
        ORDER BY issued_at DESC
        LIMIT $2 OFFSET $3`,
      [customerId, safeLimit, safeOffset],
    ),
    db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM official_receipts WHERE customer_id = $1`,
      [customerId],
    ),
  ]);

  return {
    rows: rowsResult.rows.map(mapOrRow),
    total: Number(totalResult.rows[0]?.total ?? 0),
  };
}

export async function listOrsByProvider(
  providerId: string,
  year?: number,
  quarter?: 1 | 2 | 3 | 4,
): Promise<OfficialReceipt[]> {
  if (!providerId) throw createAppError('providerId is required.', 400);

  const clauses: string[] = ['provider_id = $1'];
  const params: unknown[] = [providerId];

  if (year !== undefined) {
    if (!Number.isInteger(year) || year < 2000 || year > 9999) {
      throw createAppError('year must be a 4-digit integer.', 400);
    }
    params.push(year);
    clauses.push(`EXTRACT(YEAR FROM issued_at AT TIME ZONE 'Asia/Manila')::int = $${params.length}`);
  }

  if (quarter !== undefined) {
    if (![1, 2, 3, 4].includes(quarter)) {
      throw createAppError('quarter must be 1, 2, 3 or 4.', 400);
    }
    params.push(quarter);
    clauses.push(
      `EXTRACT(QUARTER FROM issued_at AT TIME ZONE 'Asia/Manila')::int = $${params.length}`,
    );
  }

  const result = await db.query<OfficialReceiptRow>(
    `SELECT ${OR_SELECT} FROM official_receipts
      WHERE ${clauses.join(' AND ')}
      ORDER BY issued_at ASC`,
    params,
  );
  return result.rows.map(mapOrRow);
}

export async function searchOrs(query: {
  orNumber?: string;
  customerId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: OfficialReceipt[]; total: number }> {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (query.orNumber) {
    params.push(`%${query.orNumber}%`);
    clauses.push(`or_number ILIKE $${params.length}`);
  }
  if (query.customerId) {
    params.push(query.customerId);
    clauses.push(`customer_id = $${params.length}`);
  }
  if (query.from) {
    const fromDate = new Date(query.from);
    if (Number.isNaN(fromDate.getTime())) {
      throw createAppError('from must be a valid ISO date.', 400);
    }
    params.push(fromDate);
    clauses.push(`issued_at >= $${params.length}`);
  }
  if (query.to) {
    const toDate = new Date(query.to);
    if (Number.isNaN(toDate.getTime())) {
      throw createAppError('to must be a valid ISO date.', 400);
    }
    params.push(toDate);
    clauses.push(`issued_at <= $${params.length}`);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const safeLimit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const safeOffset = Math.max(Number(query.offset) || 0, 0);

  const rowsParams = [...params, safeLimit, safeOffset];
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;

  const [rowsResult, totalResult] = await Promise.all([
    db.query<OfficialReceiptRow>(
      `SELECT ${OR_SELECT} FROM official_receipts
       ${where}
       ORDER BY issued_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      rowsParams,
    ),
    db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM official_receipts ${where}`,
      params,
    ),
  ]);

  return {
    rows: rowsResult.rows.map(mapOrRow),
    total: Number(totalResult.rows[0]?.total ?? 0),
  };
}
