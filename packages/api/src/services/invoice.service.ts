import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as notificationService from './notification.service';
import { platformConfig } from '../config/platform.config';
import { formatPHP } from '../utils/currency';

interface InvoiceRow {
  id: string;
  business_account_id: string;
  invoice_number: string;
  billing_period_start: string;
  billing_period_end: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  due_date: string;
  paid_at: Date | null;
  payment_reference: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  booking_id: string | null;
  contract_id: string | null;
  description: string;
  service_date: string | null;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  amount: number;
  created_at: Date;
}

interface BookingForInvoicing {
  id: string;
  description: string;
  scheduled_at: Date;
  total_amount: number;
  service_price: number;
  category_name: string;
}

/**
 * Aggregated row returned by the per-account CTE: account fields + a JSON
 * array of all eligible bookings for the billing period + the subtotal.
 */
interface AccountWithBookingsRow {
  id: string;
  company_name: string;
  owner_user_id: string;
  payment_terms: string;
  volume_discount_rate: string;
  items: BookingForInvoicing[];
  subtotal: number;
}

interface CountRow { count: string }

function generateInvoiceNumber(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `INV-${year}${month}-${random}`;
}

function getDueDate(invoiceDate: Date, paymentTerms: string): Date {
  const due = new Date(invoiceDate);
  switch (paymentTerms) {
    case 'net_15': due.setDate(due.getDate() + 15); break;
    case 'net_60': due.setDate(due.getDate() + 60); break;
    default: due.setDate(due.getDate() + platformConfig.invoiceDefaultDueTermsDays); break;
  }
  return due;
}

/**
 * Phase 13 Dispatch E — bulk B2B monthly invoicing.
 *
 * Old shape: O(accounts) outer loop, each iteration ran 2 SELECTs +
 * 1 INSERT invoice + N INSERT items + 1 notification (worst case
 * O(accounts × bookings) DB calls).
 *
 * New shape: at most 3 db.query() calls regardless of account count:
 *   1. ONE CTE-aggregated SELECT — eligible accounts + their period
 *      bookings rolled up via json_agg (LEFT-JOINed against existing
 *      invoices to skip already-billed periods).
 *   2. ONE bulk INSERT into business_invoices using UNNEST, RETURNING
 *      (id, business_account_id) so we can map invoices back to bookings.
 *   3. ONE bulk INSERT into business_invoice_items using UNNEST.
 *
 * Notifications are per-account (not db.query), dispatched out of band
 * and tolerant of individual failure.
 */
export async function generateMonthlyInvoices(): Promise<number> {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodStart = lastMonth.toISOString().split('T')[0]!;
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]!;

  // Query 1: per-account aggregate. Returns ONLY accounts that
  //   (a) are active,
  //   (b) have no existing invoice for this period, and
  //   (c) have at least one eligible booking in the period.
  const aggregated = await db.query<AccountWithBookingsRow>(
    `WITH eligible AS (
       SELECT ba.id, ba.company_name, ba.owner_user_id, ba.payment_terms,
              ba.volume_discount_rate
       FROM business_accounts ba
       LEFT JOIN business_invoices bi
         ON bi.business_account_id = ba.id
        AND bi.billing_period_start = $1::date
        AND bi.billing_period_end = $2::date
       WHERE ba.status = 'active'
         AND bi.id IS NULL
     ),
     period_bookings AS (
       SELECT e.id AS account_id,
              b.id, b.description, b.scheduled_at,
              b.total_amount, b.service_price,
              sc.name AS category_name
       FROM eligible e
       INNER JOIN business_members bm ON bm.business_account_id = e.id
       INNER JOIN bookings b ON b.customer_id = bm.user_id
       LEFT JOIN service_categories sc ON b.category_id = sc.id
       WHERE b.status IN ('confirmed', 'payout_ready', 'paid_out')
         AND b.scheduled_at >= $1::date
         AND b.scheduled_at < ($2::date + INTERVAL '1 day')
     )
     SELECT e.id, e.company_name, e.owner_user_id, e.payment_terms,
            e.volume_discount_rate,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', pb.id,
                  'description', pb.description,
                  'scheduled_at', pb.scheduled_at,
                  'total_amount', pb.total_amount,
                  'service_price', pb.service_price,
                  'category_name', pb.category_name
                ) ORDER BY pb.scheduled_at
              ) FILTER (WHERE pb.id IS NOT NULL),
              '[]'::json
            ) AS items,
            COALESCE(SUM(pb.service_price), 0)::bigint AS subtotal
     FROM eligible e
     LEFT JOIN period_bookings pb ON pb.account_id = e.id
     GROUP BY e.id, e.company_name, e.owner_user_id, e.payment_terms,
              e.volume_discount_rate
     HAVING COUNT(pb.id) > 0`,
    [periodStart, periodEnd],
  );

  if (aggregated.rows.length === 0) {
    return 0;
  }

  // Compute per-account totals in JS (math touches platform constants).
  type ComputedInvoice = {
    account: AccountWithBookingsRow;
    invoiceNumber: string;
    dueDateIso: string;
    discountRate: number;
    discountAmount: number;
    taxAmount: number;
    totalAmount: number;
  };

  const computed: ComputedInvoice[] = aggregated.rows.map((acc) => {
    const subtotal = Number(acc.subtotal);
    const discountRate = Number(acc.volume_discount_rate) / 100;
    const discountAmount = Math.round(subtotal * discountRate);
    const afterDiscount = subtotal - discountAmount;
    const taxAmount = Math.round(afterDiscount * platformConfig.vatRate);
    const totalAmount = afterDiscount + taxAmount;
    const invoiceNumber = generateInvoiceNumber(now);
    const dueDate = getDueDate(now, acc.payment_terms);
    const dueDateIso = dueDate.toISOString().split('T')[0]!;
    return {
      account: { ...acc, subtotal },
      invoiceNumber,
      dueDateIso,
      discountRate,
      discountAmount,
      taxAmount,
      totalAmount,
    };
  });

  // Query 2: bulk INSERT business_invoices via UNNEST. RETURNING ties each
  // generated id back to its account so we can build invoice_items below.
  const accountIds: string[] = computed.map((c) => c.account.id); // SAFE-N+1: in-memory column projection feeding bulk UNNEST insert (single round-trip).
  const invoiceNumbers: string[] = computed.map((c) => c.invoiceNumber); // SAFE-N+1: in-memory column projection feeding bulk UNNEST insert (single round-trip).
  const subtotals: number[] = computed.map((c) => c.account.subtotal); // SAFE-N+1: in-memory column projection feeding bulk UNNEST insert (single round-trip).
  const discounts: number[] = computed.map((c) => c.discountAmount); // SAFE-N+1: in-memory column projection feeding bulk UNNEST insert (single round-trip).
  const taxes: number[] = computed.map((c) => c.taxAmount); // SAFE-N+1: in-memory column projection feeding bulk UNNEST insert (single round-trip).
  const totals: number[] = computed.map((c) => c.totalAmount); // SAFE-N+1: in-memory column projection feeding bulk UNNEST insert (single round-trip).
  const dueDates: string[] = computed.map((c) => c.dueDateIso); // SAFE-N+1: in-memory column projection feeding bulk UNNEST insert (single round-trip).

  // MED-N117 fix — pre-fix the bulk INSERT business_invoices and the
  // bulk INSERT business_invoice_items ran as TWO separate
  // db.query calls. If the items INSERT failed (DB blip, FK
  // violation), invoices existed with NO line items — customer saw
  // totals on screen but no breakdown, ops had to manually delete +
  // regenerate.
  //
  // Post-fix: both bulk inserts run on the same trx client. Either
  // both land or neither does. The post-trx work (notifications) is
  // unchanged (best-effort, never blocks).
  const insertedInvoices = await db.transaction(async (client) => {
    const inv = await client.query<{ id: string; business_account_id: string }>(
      `INSERT INTO business_invoices (
         business_account_id, invoice_number,
         billing_period_start, billing_period_end,
         subtotal, discount_amount, tax_amount, total_amount,
         status, due_date
       )
       SELECT * FROM UNNEST(
         $1::uuid[], $2::text[],
         ARRAY_FILL($3::date, ARRAY[array_length($1::uuid[], 1)]),
         ARRAY_FILL($4::date, ARRAY[array_length($1::uuid[], 1)]),
         $5::bigint[], $6::bigint[], $7::bigint[], $8::bigint[],
         ARRAY_FILL('sent'::varchar, ARRAY[array_length($1::uuid[], 1)]),
         $9::date[]
       )
       RETURNING id, business_account_id`,
      [
        accountIds, invoiceNumbers,
        periodStart, periodEnd,
        subtotals, discounts, taxes, totals,
        dueDates,
      ],
    );
    // Items insert — runs INSIDE the same trx via the same client.
    // Build flat arrays here so we have invoice IDs from `inv` first.
    const invoiceByAccount = new Map<string, string>();
    for (const row of inv.rows) invoiceByAccount.set(row.business_account_id, row.id);

    const tItemInvoiceIds: string[] = [];
    const tItemBookingIds: string[] = [];
    const tItemDescriptions: string[] = [];
    const tItemServiceDates: string[] = [];
    const tItemUnitPrices: number[] = [];
    const tItemDiscounts: number[] = [];
    const tItemAmounts: number[] = [];
    for (const c of computed) {
      const invoiceId = invoiceByAccount.get(c.account.id);
      if (!invoiceId) continue;
      for (const booking of c.account.items) {
        const unitPrice = Number(booking.service_price);
        const itemDiscount = Math.round(unitPrice * c.discountRate);
        const amount = unitPrice - itemDiscount;
        const scheduledAt = booking.scheduled_at instanceof Date
          ? booking.scheduled_at
          : new Date(booking.scheduled_at);
        tItemInvoiceIds.push(invoiceId);
        tItemBookingIds.push(booking.id);
        tItemDescriptions.push(`${booking.category_name ?? 'Service'} - ${booking.description ?? ''}`.trim());
        tItemServiceDates.push(scheduledAt.toISOString().split('T')[0]!);
        tItemUnitPrices.push(unitPrice);
        tItemDiscounts.push(itemDiscount);
        tItemAmounts.push(amount);
      }
    }
    if (tItemInvoiceIds.length > 0) {
      await client.query(
        `INSERT INTO business_invoice_items (
           invoice_id, booking_id, description, service_date,
           quantity, unit_price, discount_amount, amount
         )
         SELECT * FROM UNNEST(
           $1::uuid[], $2::uuid[], $3::text[], $4::date[],
           ARRAY_FILL(1::int, ARRAY[array_length($1::uuid[], 1)]),
           $5::bigint[], $6::bigint[], $7::bigint[]
         )`,
        [
          tItemInvoiceIds, tItemBookingIds, tItemDescriptions, tItemServiceDates,
          tItemUnitPrices, tItemDiscounts, tItemAmounts,
        ],
      );
    }
    return inv;
  });

  // MED-N117 — items INSERT moved inside the trx above. Recompute
  // the account→invoice map for the post-trx notification loop only
  // (the items themselves are already persisted atomically).
  const invoiceByAccount = new Map<string, string>();
  for (const row of insertedInvoices.rows) {
    invoiceByAccount.set(row.business_account_id, row.id);
  }

  // Notifications — per-account, out of band, individual failures swallowed
  // (notification dispatch never blocks invoice generation).
  let generated = 0;
  for (const c of computed) { // SAFE-N+1: bounded monthly cron loop over computed invoices; sends out-of-band notification per account (notification dispatch is non-blocking and not in DB hot path).
    const invoiceId = invoiceByAccount.get(c.account.id);
    if (!invoiceId) continue;
    generated++;

    try {
      await notificationService.createNotification({
        userId: c.account.owner_user_id,
        type: 'business_update',
        title: 'Monthly Invoice Ready',
        body: `Invoice ${c.invoiceNumber} for ${formatPHP(c.totalAmount)} is ready. Due by ${new Date(c.dueDateIso).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })}.`,
        data: { invoiceId, invoiceNumber: c.invoiceNumber, totalAmount: c.totalAmount },
      });
    } catch (err) {
      logger.error('Failed to dispatch monthly-invoice notification', {
        invoiceId,
        businessAccountId: c.account.id,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }

    logger.info('Monthly invoice generated', {
      invoiceId,
      invoiceNumber: c.invoiceNumber,
      businessAccountId: c.account.id,
      totalAmount: c.totalAmount,
      itemCount: c.account.items.length,
    });
  }

  return generated;
}

export async function getInvoices(
  businessId: string,
  userId: string,
  page = 1,
  pageSize = 20,
): Promise<{ items: InvoiceRow[]; total: number }> {
  const member = await db.query(
    `SELECT can_view_invoices, role FROM business_members
     WHERE business_account_id = $1 AND user_id = $2`,
    [businessId, userId],
  );

  if (member.rows.length === 0) {
    throw createAppError('Access denied.', 403);
  }

  const row = member.rows[0] as { can_view_invoices: boolean; role: string };
  if (!row.can_view_invoices && row.role === 'member') {
    throw createAppError('You do not have permission to view invoices.', 403);
  }

  const offset = (page - 1) * pageSize;

  const [dataResult, countResult] = await Promise.all([
    db.query<InvoiceRow>(
      `SELECT * FROM business_invoices
       WHERE business_account_id = $1
       ORDER BY billing_period_end DESC
       LIMIT $2 OFFSET $3`,
      [businessId, pageSize, offset],
    ),
    db.query<CountRow>(
      `SELECT COUNT(*)::text as count FROM business_invoices WHERE business_account_id = $1`,
      [businessId],
    ),
  ]);

  return {
    items: dataResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

export async function getInvoiceDetail(
  invoiceId: string,
  userId: string,
): Promise<{ invoice: InvoiceRow; items: InvoiceItemRow[] }> {
  const invoice = await db.query<InvoiceRow>(
    `SELECT * FROM business_invoices WHERE id = $1`,
    [invoiceId],
  );

  if (invoice.rows.length === 0) {
    throw createAppError('Invoice not found.', 404);
  }

  const member = await db.query(
    `SELECT can_view_invoices, role FROM business_members
     WHERE business_account_id = $1 AND user_id = $2`,
    [invoice.rows[0]!.business_account_id, userId],
  );

  if (member.rows.length === 0) {
    throw createAppError('Access denied.', 403);
  }

  const row = member.rows[0] as { can_view_invoices: boolean; role: string };
  if (!row.can_view_invoices && row.role === 'member') {
    throw createAppError('You do not have permission to view invoices.', 403);
  }

  const items = await db.query<InvoiceItemRow>(
    `SELECT * FROM business_invoice_items WHERE invoice_id = $1 ORDER BY service_date ASC`,
    [invoiceId],
  );

  return { invoice: invoice.rows[0]!, items: items.rows };
}

export async function markInvoicePaid(
  invoiceId: string,
  paymentReference: string,
): Promise<InvoiceRow> {
  const result = await db.query<InvoiceRow>(
    `UPDATE business_invoices
     SET status = 'paid', paid_at = NOW(), payment_reference = $1, updated_at = NOW()
     WHERE id = $2 AND status IN ('sent', 'overdue')
     RETURNING *`,
    [paymentReference, invoiceId],
  );

  if (result.rows.length === 0) {
    throw createAppError('Invoice not found or not payable.', 404);
  }

  logger.info('Invoice marked as paid', { invoiceId, paymentReference });
  return result.rows[0]!;
}

export async function checkOverdueInvoices(): Promise<number> {
  const today = new Date().toISOString().split('T')[0]!;

  const result = await db.query<{ id: string; business_account_id: string; invoice_number: string; total_amount: number }>(
    `UPDATE business_invoices
     SET status = 'overdue', updated_at = NOW()
     WHERE status = 'sent' AND due_date < $1
     RETURNING id, business_account_id, invoice_number, total_amount`,
    [today],
  );

  const overdueCount = result.rows.length;

  if (overdueCount > 0) {
    for (const inv of result.rows) { // SAFE-N+1: bounded daily cron over overdue invoices (small set); per-row owner lookup gated behind try/catch and used only to emit notification side effect.
      try {
        const account = await db.query<{ owner_user_id: string }>(
          `SELECT owner_user_id FROM business_accounts WHERE id = $1`,
          [inv.business_account_id],
        );

        if (account.rows[0]) {
          await notificationService.createNotification({
            userId: account.rows[0].owner_user_id,
            type: 'business_update',
            title: 'Invoice Overdue',
            body: `Invoice ${inv.invoice_number} for ${formatPHP(inv.total_amount)} is overdue. Please settle to avoid service interruption.`,
            data: { invoiceNumber: inv.invoice_number, businessAccountId: inv.business_account_id },
          });
        }
      } catch (err) {
        logger.error('Failed to send overdue notification', {
          invoiceId: inv.id,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    }

    logger.info('Overdue invoices flagged', { count: overdueCount });
  }

  return overdueCount;
}

export function formatInvoice(inv: InvoiceRow): Record<string, unknown> {
  return {
    id: inv.id,
    businessAccountId: inv.business_account_id,
    invoiceNumber: inv.invoice_number,
    billingPeriodStart: inv.billing_period_start,
    billingPeriodEnd: inv.billing_period_end,
    subtotal: inv.subtotal,
    discountAmount: inv.discount_amount,
    taxAmount: inv.tax_amount,
    totalAmount: inv.total_amount,
    status: inv.status,
    dueDate: inv.due_date,
    paidAt: inv.paid_at,
    paymentReference: inv.payment_reference,
    notes: inv.notes,
    createdAt: inv.created_at,
    updatedAt: inv.updated_at,
  };
}

export function formatInvoiceItem(item: InvoiceItemRow): Record<string, unknown> {
  return {
    id: item.id,
    invoiceId: item.invoice_id,
    bookingId: item.booking_id,
    contractId: item.contract_id,
    description: item.description,
    serviceDate: item.service_date,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    discountAmount: item.discount_amount,
    amount: item.amount,
    createdAt: item.created_at,
  };
}
