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

interface BusinessAccountForInvoicing {
  id: string;
  company_name: string;
  owner_user_id: string;
  payment_terms: string;
  volume_discount_rate: string;
  status: string;
}

interface BookingForInvoicing {
  id: string;
  description: string;
  scheduled_at: Date;
  total_amount: number;
  service_price: number;
  category_name: string;
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

export async function generateMonthlyInvoices(): Promise<number> {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodStart = lastMonth.toISOString().split('T')[0]!;
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]!;

  const activeAccounts = await db.query<BusinessAccountForInvoicing>(
    `SELECT ba.id, ba.company_name, ba.owner_user_id, ba.payment_terms, ba.volume_discount_rate, ba.status
     FROM business_accounts ba
     WHERE ba.status = 'active'`,
  );

  let generated = 0;

  for (const account of activeAccounts.rows) {
    try {
      const existingInvoice = await db.query(
        `SELECT 1 FROM business_invoices
         WHERE business_account_id = $1
           AND billing_period_start = $2
           AND billing_period_end = $3`,
        [account.id, periodStart, periodEnd],
      );

      if (existingInvoice.rows.length > 0) continue;

      const bookings = await db.query<BookingForInvoicing>(
        `SELECT b.id, b.description, b.scheduled_at, b.total_amount, b.service_price,
                sc.name AS category_name
         FROM bookings b
         INNER JOIN business_members bm ON b.customer_id = bm.user_id
         LEFT JOIN service_categories sc ON b.category_id = sc.id
         WHERE bm.business_account_id = $1
           AND b.status IN ('confirmed', 'payout_ready', 'paid_out')
           AND b.scheduled_at >= $2::date
           AND b.scheduled_at < ($3::date + INTERVAL '1 day')
         ORDER BY b.scheduled_at ASC`,
        [account.id, periodStart, periodEnd],
      );

      if (bookings.rows.length === 0) continue;

      const subtotal = bookings.rows.reduce((sum, b) => sum + b.service_price, 0);
      const discountRate = Number(account.volume_discount_rate) / 100;
      const discountAmount = Math.round(subtotal * discountRate);
      const afterDiscount = subtotal - discountAmount;
      const taxAmount = Math.round(afterDiscount * platformConfig.vatRate);
      const totalAmount = afterDiscount + taxAmount;

      const invoiceNumber = generateInvoiceNumber(now);
      const dueDate = getDueDate(now, account.payment_terms);

      const invoice = await db.query<InvoiceRow>(
        `INSERT INTO business_invoices (
          business_account_id, invoice_number,
          billing_period_start, billing_period_end,
          subtotal, discount_amount, tax_amount, total_amount,
          status, due_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'sent', $9)
        RETURNING *`,
        [
          account.id, invoiceNumber,
          periodStart, periodEnd,
          subtotal, discountAmount, taxAmount, totalAmount,
          dueDate.toISOString().split('T')[0],
        ],
      );

      const invoiceId = invoice.rows[0]!.id;

      for (const booking of bookings.rows) {
        const itemDiscount = Math.round(booking.service_price * discountRate);
        await db.query(
          `INSERT INTO business_invoice_items (
            invoice_id, booking_id, description, service_date,
            quantity, unit_price, discount_amount, amount
          ) VALUES ($1, $2, $3, $4, 1, $5, $6, $7)`,
          [
            invoiceId, booking.id,
            `${booking.category_name ?? 'Service'} — ${booking.description ?? ''}`.trim(),
            booking.scheduled_at.toISOString().split('T')[0],
            booking.service_price,
            itemDiscount,
            booking.service_price - itemDiscount,
          ],
        );
      }

      await notificationService.createNotification({
        userId: account.owner_user_id,
        type: 'business_update',
        title: 'Monthly Invoice Ready',
        body: `Invoice ${invoiceNumber} for ${formatPHP(totalAmount)} is ready. Due by ${dueDate.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })}.`,
        data: { invoiceId, invoiceNumber, totalAmount },
      });

      generated++;
      logger.info('Monthly invoice generated', {
        invoiceId,
        invoiceNumber,
        businessAccountId: account.id,
        totalAmount,
        itemCount: bookings.rows.length,
      });
    } catch (err) {
      logger.error('Failed to generate invoice for business account', {
        businessAccountId: account.id,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
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
    for (const inv of result.rows) {
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
