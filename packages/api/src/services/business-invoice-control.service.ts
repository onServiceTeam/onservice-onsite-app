import { createHash } from 'crypto';
import type { QueryResult, QueryResultRow } from 'pg';
import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';
import { generateInvoiceNumber } from './invoice.service';
import type { InvoiceRow } from './invoice.service';
import type {
  BusinessInvoicePreviewInput,
  RecordBusinessInvoiceAdjustmentInput,
  RecordBusinessInvoicePaymentInput,
  ReverseBusinessInvoicePaymentInput,
} from '../validators/admin-business.validators';

type Queryable = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<T>>;
};

interface AccountRow {
  id: string;
  company_name: string;
  owner_user_id: string;
  status: string;
  record_version: number;
}

interface CandidateRow {
  id: string;
  business_account_id: string;
  description: string;
  scheduled_at: Date;
  status: string;
  service_price: number;
  service_fee: number;
  total_amount: number;
  category_name: string | null;
  contract_id: string | null;
  contract_account_id: string | null;
  contract_published_at: Date | null;
  business_account_terms_version_id: string | null;
  terms_account_id: string | null;
  payment_terms: 'net_15' | 'net_30' | 'net_60' | null;
  volume_discount_basis_points: number | null;
  booking_financial_terms_id: string | null;
  booking_terms_state: string | null;
  claimed_invoice_id: string | null;
}

interface CandidateItem {
  bookingId: string;
  contractId: string;
  accountTermsVersionId: string;
  bookingFinancialTermsId: string;
  description: string;
  serviceDate: string;
  servicePrice: number;
  serviceFee: number;
  sourceBookingTotal: number;
  discountAmount: number;
  amount: number;
}

interface CandidateGroup {
  accountTermsVersionId: string;
  paymentTerms: 'net_15' | 'net_30' | 'net_60';
  volumeDiscountBasisPoints: number;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  manifestHash: string;
  items: CandidateItem[];
}

interface CandidateException {
  bookingId: string;
  code: string;
  message: string;
  blocking: true;
}

interface CandidateState {
  account: AccountRow;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  groups: CandidateGroup[];
  exceptions: CandidateException[];
  fingerprint: string;
}

interface InvoicePreviewRow {
  id: string;
  business_account_id: string;
  created_by: string;
  account_record_version: number;
  billing_period_start: string;
  billing_period_end: string;
  candidate_fingerprint: string;
  candidate_summary: { groups: CandidateGroup[] };
  exception_summary: CandidateException[];
  expires_at: Date;
  created_at: Date;
}

interface ControlledInvoiceRow extends InvoiceRow {
  record_version: number;
  control_state: string;
  settlement_state: string;
  currency: string;
  account_terms_version_id: string | null;
  preparation_preview_id: string | null;
  manifest_hash: string | null;
  finalized_at: Date | null;
}

interface InvoiceBalanceRow {
  adjustment_total: number;
  payment_total: number;
  adjusted_total: number;
  balance_due: number;
}

interface PaymentEvidenceRow {
  id: string;
  invoice_id: string;
  entry_type: 'payment' | 'reversal';
  amount: number;
  currency: string;
  method: 'bank_transfer' | 'cash_deposit' | 'check' | 'other_external';
  effective_at: Date;
  external_reference: string;
}

export interface InvoiceControlPreview {
  id: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  groups: Array<Omit<CandidateGroup, 'items'> & { items: CandidateItem[] }>;
  exceptions: CandidateException[];
  expiresAt: Date;
  createdAt: Date;
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function assertReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length < 10 || trimmed.length > 2000) {
    throw createAppError('Reason must be between 10 and 2000 characters.', 400);
  }
  return trimmed;
}

function assertCentavos(amount: number, label: string): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw createAppError(`${label} must be a positive integer amount in centavos.`, 400);
  }
}

async function lockBusinessControls(client: Queryable, accountId: string): Promise<void> {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext('onservice:b2b:' || $1::text))`,
    [accountId],
  );
}

async function loadInvoiceAccountId(client: Queryable, invoiceId: string): Promise<string> {
  const result = await client.query<{ business_account_id: string }>(
    `SELECT business_account_id FROM business_invoices WHERE id = $1`,
    [invoiceId],
  );
  const accountId = result.rows[0]?.business_account_id;
  if (!accountId) throw createAppError('Business statement not found.', 404);
  return accountId;
}

async function assertExternalReferenceAvailable(
  client: Queryable,
  method: string,
  externalReference: string,
): Promise<void> {
  // Account-level locking cannot serialize the same bank/check reference used
  // against two different company accounts. Lock the normalized external key
  // before checking the global unique index so a concurrent duplicate fails as
  // an intentional conflict instead of surfacing a raw database error.
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext('onservice:b2b-payment:' || lower($1 || ':' || $2)))`,
    [method, externalReference],
  );
  const result = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM business_invoice_payments
        WHERE method = $1 AND lower(external_reference) = lower($2)
     ) AS exists`,
    [method, externalReference],
  );
  if (result.rows[0]?.exists) {
    throw createAppError('That external payment reference is already recorded for this method.', 409);
  }
}

async function writeAudit(
  client: Queryable,
  actorId: string,
  actionType: string,
  targetId: string,
  reason: string,
  details: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO admin_actions
       (admin_id, action_type, target_type, target_id, details, reason, full_notes)
     VALUES ($1, $2, 'business_invoice', $3, $4::jsonb, $5, $5)`,
    [actorId, actionType, targetId, JSON.stringify(details), reason],
  );
}

function previousManilaMonth(now = new Date()): { start: string; end: string } {
  const manilaDay = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const anchor = new Date(`${manilaDay}T00:00:00.000Z`);
  const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function dueDaysForTerms(terms: string): number {
  return terms === 'net_15' ? 15
    : terms === 'net_60' ? 60
      : platformConfig.invoiceDefaultDueTermsDays;
}

export function dueDateForTerms(invoiceDate: Date, terms: string): string {
  const due = new Date(invoiceDate);
  due.setUTCDate(due.getUTCDate() + dueDaysForTerms(terms));
  return due.toISOString().slice(0, 10);
}

function manilaDate(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value);
}

function roundedBasisPointAmount(amount: number, basisPoints: number): number | null {
  if (!Number.isSafeInteger(amount) || amount < 0
    || !Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    return null;
  }
  const rounded = (BigInt(amount) * BigInt(basisPoints) + 5_000n) / 10_000n;
  const result = Number(rounded);
  return Number.isSafeInteger(result) ? result : null;
}

function blockingException(row: CandidateRow, expectedAccountId: string): CandidateException | null {
  if (!['confirmed', 'payout_ready', 'paid_out'].includes(row.status)) {
    if (row.status === 'resolved') {
      return {
        bookingId: row.id,
        code: 'dispute_resolution_settlement_unreconciled',
        message: 'The dispute decision is recorded, but its refund or provider-settlement outcome is not yet safe for company billing.',
        blocking: true,
      };
    }
    return {
      bookingId: row.id,
      code: row.status === 'disputed' ? 'booking_disputed' : 'service_not_complete',
      message: row.status === 'disputed'
        ? 'The booking is disputed and cannot enter a commercial statement.'
        : `The booking is still ${row.status.replaceAll('_', ' ')}. Complete or cancel it before closing this period.`,
      blocking: true,
    };
  }
  if (row.business_account_id !== expectedAccountId
    || !row.contract_id
    || row.contract_account_id !== expectedAccountId
    || row.terms_account_id !== expectedAccountId) {
    return {
      bookingId: row.id,
      code: 'invalid_business_contract_link',
      message: 'The booking does not have a complete same-account contract and terms snapshot.',
      blocking: true,
    };
  }
  if (!row.contract_published_at) {
    return {
      bookingId: row.id,
      code: 'contract_not_published',
      message: 'The linked contract has no controlled publication evidence.',
      blocking: true,
    };
  }
  if (!row.business_account_terms_version_id || !row.payment_terms
    || row.volume_discount_basis_points === null) {
    return {
      bookingId: row.id,
      code: 'missing_account_terms_snapshot',
      message: 'The booking has no approved business-terms snapshot.',
      blocking: true,
    };
  }
  if (!row.booking_financial_terms_id || row.booking_terms_state !== 'final') {
    return {
      bookingId: row.id,
      code: 'financial_terms_not_final',
      message: 'The booking financial terms are not final and must be reviewed before billing.',
      blocking: true,
    };
  }
  // node-postgres returns BIGINT columns as strings. Convert at this trust
  // boundary before validating, otherwise every real migrated booking would
  // fail while number-shaped mocks continued to pass.
  const servicePrice = Number(row.service_price);
  const serviceFee = Number(row.service_fee);
  const totalAmount = Number(row.total_amount);
  if (![servicePrice, serviceFee, totalAmount].every(Number.isSafeInteger)
    || servicePrice < 0 || serviceFee < 0
    || totalAmount !== servicePrice + serviceFee) {
    return {
      bookingId: row.id,
      code: 'booking_amount_mismatch',
      message: 'The booking amount does not reconcile to service price plus service fee.',
      blocking: true,
    };
  }
  return null;
}

async function buildCandidateState(
  client: Queryable,
  accountId: string,
  periodStart: string,
  periodEnd: string,
  ignorePreparationPreviewId: string | null = null,
): Promise<CandidateState> {
  const accountResult = await client.query<AccountRow>(
    `SELECT id, company_name, owner_user_id, status, record_version
       FROM business_accounts WHERE id = $1`,
    [accountId],
  );
  const account = accountResult.rows[0];
  if (!account) throw createAppError('Business account not found.', 404);
  if (!['active', 'suspended'].includes(account.status)) {
    throw createAppError('Only an active or suspended business account can prepare statements for existing work.', 409);
  }

  const result = await client.query<CandidateRow>(
    `SELECT b.id, b.business_account_id, b.description, b.scheduled_at, b.status,
            b.service_price, b.service_fee, b.total_amount,
            sc.name AS category_name,
            b.contract_id,
            bc.business_account_id AS contract_account_id,
            bc.published_at AS contract_published_at,
            b.business_account_terms_version_id,
            batv.business_account_id AS terms_account_id,
            batv.payment_terms,
            batv.volume_discount_basis_points,
            bft.id AS booking_financial_terms_id,
            bft.terms_state AS booking_terms_state,
            claimed.invoice_id AS claimed_invoice_id
       FROM bookings b
       LEFT JOIN service_categories sc ON sc.id = b.category_id
       LEFT JOIN business_contracts bc ON bc.id = b.contract_id
       LEFT JOIN business_account_term_versions batv
         ON batv.id = b.business_account_terms_version_id
       LEFT JOIN booking_financial_terms_current bft ON bft.booking_id = b.id
       LEFT JOIN LATERAL (
         SELECT bii.invoice_id
           FROM business_invoice_items bii
           JOIN business_invoices bi ON bi.id = bii.invoice_id
          WHERE bii.booking_id = b.id
            AND bi.status NOT IN ('cancelled', 'void')
            AND ($4::uuid IS NULL OR bi.preparation_preview_id IS DISTINCT FROM $4::uuid)
          ORDER BY bii.created_at ASC
          LIMIT 1
       ) claimed ON TRUE
      WHERE b.business_account_id = $1
        AND b.scheduled_at >= ($2::date AT TIME ZONE 'Asia/Manila')
        AND b.scheduled_at < (($3::date + INTERVAL '1 day') AT TIME ZONE 'Asia/Manila')
        AND b.status NOT IN ('cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin')
      ORDER BY b.scheduled_at ASC, b.id ASC`,
    [accountId, periodStart, periodEnd, ignorePreparationPreviewId],
  );

  const exceptions: CandidateException[] = [];
  const byTerms = new Map<string, CandidateGroup>();
  for (const row of result.rows) {
    // A booking already owned by a non-void statement is not a candidate for
    // this run. It must not become a duplicate, but it also must not block a
    // late eligible booking or a replacement for a separately voided terms
    // group in the same period.
    if (row.claimed_invoice_id) continue;
    const exception = blockingException(row, accountId);
    if (exception) {
      exceptions.push(exception);
      continue;
    }
    const termsId = row.business_account_terms_version_id!;
    let group = byTerms.get(termsId);
    if (!group) {
      group = {
        accountTermsVersionId: termsId,
        paymentTerms: row.payment_terms!,
        volumeDiscountBasisPoints: Number(row.volume_discount_basis_points),
        subtotal: 0,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 0,
        manifestHash: '',
        items: [],
      };
      byTerms.set(termsId, group);
    }
    const servicePrice = Number(row.service_price);
    const serviceFee = Number(row.service_fee);
    const sourceBookingTotal = Number(row.total_amount);
    const basisPoints = Number(row.volume_discount_basis_points);
    const discountAmount = roundedBasisPointAmount(servicePrice, basisPoints);
    if (discountAmount === null) {
      exceptions.push({
        bookingId: row.id,
        code: 'statement_discount_amount_overflow',
        message: 'The booking discount cannot be represented exactly in statement centavos.',
        blocking: true,
      });
      continue;
    }
    const itemAmount = sourceBookingTotal - discountAmount;
    const nextSubtotal = group.subtotal + sourceBookingTotal;
    const nextDiscount = group.discountAmount + discountAmount;
    const nextTotal = group.totalAmount + itemAmount;
    if (![itemAmount, nextSubtotal, nextDiscount, nextTotal].every(Number.isSafeInteger)) {
      exceptions.push({
        bookingId: row.id,
        code: 'statement_group_amount_overflow',
        message: 'This booking would make the statement group exceed exact centavo arithmetic limits.',
        blocking: true,
      });
      continue;
    }
    const item: CandidateItem = {
      bookingId: row.id,
      contractId: row.contract_id!,
      accountTermsVersionId: termsId,
      bookingFinancialTermsId: row.booking_financial_terms_id!,
      description: `${row.category_name ?? 'Service'} - ${row.description ?? ''}`.trim(),
      serviceDate: manilaDate(row.scheduled_at instanceof Date ? row.scheduled_at : new Date(row.scheduled_at)),
      servicePrice,
      serviceFee,
      sourceBookingTotal,
      discountAmount,
      amount: itemAmount,
    };
    group.items.push(item);
    group.subtotal = nextSubtotal;
    group.discountAmount = nextDiscount;
    group.totalAmount = nextTotal;
  }
  const groups = Array.from(byTerms.values())
    .sort((a, b) => a.accountTermsVersionId.localeCompare(b.accountTermsVersionId));
  for (const group of groups) {
    group.manifestHash = hash({
      accountId,
      periodStart,
      periodEnd,
      accountTermsVersionId: group.accountTermsVersionId,
      paymentTerms: group.paymentTerms,
      volumeDiscountBasisPoints: group.volumeDiscountBasisPoints,
      items: group.items,
    });
  }
  const stateForHash = {
    account: { id: account.id, status: account.status, recordVersion: account.record_version },
    periodStart,
    periodEnd,
    groups,
    exceptions,
  };
  return {
    account,
    billingPeriodStart: periodStart,
    billingPeriodEnd: periodEnd,
    groups,
    exceptions,
    fingerprint: hash(stateForHash),
  };
}

export async function previewInvoiceForAccount(
  accountId: string,
  input: BusinessInvoicePreviewInput,
  actorId: string,
): Promise<InvoiceControlPreview> {
  const defaultPeriod = previousManilaMonth();
  const periodStart = input.billingPeriodStart ?? defaultPeriod.start;
  const periodEnd = input.billingPeriodEnd ?? defaultPeriod.end;
  if (periodEnd < periodStart) throw createAppError('Billing period end cannot be before its start.', 400);
  return db.transaction(async (client) => {
    await lockBusinessControls(client, accountId);
    const state = await buildCandidateState(client, accountId, periodStart, periodEnd);
    const inserted = await client.query<InvoicePreviewRow>(
      `INSERT INTO business_invoice_previews
         (business_account_id, created_by, account_record_version,
          billing_period_start, billing_period_end, candidate_fingerprint,
          candidate_summary, exception_summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
       RETURNING *`,
      [accountId, actorId, state.account.record_version, periodStart, periodEnd,
        state.fingerprint, JSON.stringify({ groups: state.groups }), JSON.stringify(state.exceptions)],
    );
    const preview = inserted.rows[0]!;
    return {
      id: preview.id,
      billingPeriodStart: periodStart,
      billingPeriodEnd: periodEnd,
      groups: state.groups,
      exceptions: state.exceptions,
      expiresAt: preview.expires_at,
      createdAt: preview.created_at,
    };
  });
}

export async function prepareInvoiceDrafts(params: {
  accountId: string;
  previewId: string;
  actorId: string;
  reason: string;
}): Promise<ControlledInvoiceRow[]> {
  const reason = assertReason(params.reason);
  return db.transaction(async (client) => {
    await lockBusinessControls(client, params.accountId);
    const previewResult = await client.query<InvoicePreviewRow>(
      `SELECT * FROM business_invoice_previews
        WHERE id = $1 AND business_account_id = $2 AND created_by = $3
          AND expires_at > NOW()
        FOR UPDATE`,
      [params.previewId, params.accountId, params.actorId],
    );
    const preview = previewResult.rows[0];
    if (!preview) throw createAppError('A current, unexpired statement preview by this operator is required.', 409);
    const state = await buildCandidateState(
      client,
      params.accountId,
      preview.billing_period_start,
      preview.billing_period_end,
    );
    if (state.account.record_version !== preview.account_record_version
      || state.fingerprint !== preview.candidate_fingerprint) {
      throw createAppError('Statement candidates changed after preview. Run the preview again.', 409);
    }
    if (state.exceptions.length > 0) {
      throw createAppError('Resolve every blocking statement exception before preparing a draft.', 409);
    }
    if (state.groups.length === 0) throw createAppError('No eligible business bookings exist for this period.', 409);

    const preparedAt = new Date();
    const invoices: ControlledInvoiceRow[] = [];
    for (const group of state.groups) {
      const invoiceNumber = generateInvoiceNumber(preparedAt);
      const dueDays = dueDaysForTerms(group.paymentTerms);
      const invoiceResult = await client.query<ControlledInvoiceRow>(
        `INSERT INTO business_invoices
           (business_account_id, invoice_number, billing_period_start, billing_period_end,
            subtotal, discount_amount, tax_amount, total_amount, status, due_date,
            control_state, settlement_state, document_kind, currency, account_terms_version_id,
            manifest_hash, preparation_preview_id, prepared_at, prepared_by, preparation_reason)
         VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 'draft',
                 ((NOW() AT TIME ZONE 'Asia/Manila')::date + $8::integer),
                 'controlled', 'open', 'commercial_statement', 'PHP', $9, $10, $11, NOW(), $12, $13)
         RETURNING *`,
        [params.accountId, invoiceNumber, state.billingPeriodStart, state.billingPeriodEnd,
          group.subtotal, group.discountAmount, group.totalAmount, dueDays,
          group.accountTermsVersionId, group.manifestHash, preview.id, params.actorId, reason],
      );
      const invoice = invoiceResult.rows[0];
      if (!invoice) throw createAppError('The controlled statement draft could not be created.', 500);

      const values: unknown[] = [];
      const placeholders: string[] = [];
      let parameter = 1;
      group.items.forEach((item, index) => {
        placeholders.push(`($${parameter++}, $${parameter++}, $${parameter++}, $${parameter++},
          $${parameter++}, 1, $${parameter++}, $${parameter++}, $${parameter++}, $${parameter++},
          $${parameter++}, $${parameter++}, $${parameter++}, $${parameter++}, 'PHP', $${parameter++})`);
        values.push(
          invoice.id, item.bookingId, item.contractId, item.description, item.serviceDate,
          item.sourceBookingTotal, item.discountAmount, item.amount,
          item.accountTermsVersionId, item.bookingFinancialTermsId,
          item.sourceBookingTotal, item.servicePrice, item.serviceFee, index + 1,
        );
      });
      await client.query(
        `INSERT INTO business_invoice_items
           (invoice_id, booking_id, contract_id, description, service_date, quantity,
            unit_price, discount_amount, amount, account_terms_version_id,
            booking_financial_terms_id, source_booking_total,
            service_price_amount, service_fee_amount, currency, manifest_position)
         VALUES ${placeholders.join(', ')}`,
        values,
      );
      await writeAudit(client, params.actorId, 'business_invoice_draft_prepared',
        invoice.id, reason, {
          previewId: preview.id,
          businessAccountId: params.accountId,
          accountTermsVersionId: group.accountTermsVersionId,
          manifestHash: group.manifestHash,
          billingPeriodStart: state.billingPeriodStart,
          billingPeriodEnd: state.billingPeriodEnd,
          itemCount: group.items.length,
          subtotal: group.subtotal,
          discountAmount: group.discountAmount,
          taxAmount: 0,
          totalAmount: group.totalAmount,
          documentKind: 'commercial_statement',
        });
      invoices.push(invoice);
    }
    logger.info('Controlled business statement drafts prepared', {
      businessAccountId: params.accountId,
      actorId: params.actorId,
      previewId: params.previewId,
      draftCount: invoices.length,
    });
    return invoices;
  });
}

export async function finalizeInvoice(params: {
  invoiceId: string;
  expectedVersion: number;
  actorId: string;
  reason: string;
}): Promise<ControlledInvoiceRow & { owner_user_id: string }> {
  const reason = assertReason(params.reason);
  return db.transaction(async (client) => {
    const accountId = await loadInvoiceAccountId(client, params.invoiceId);
    await lockBusinessControls(client, accountId);
    const invoiceResult = await client.query<ControlledInvoiceRow & {
      owner_user_id: string;
      payment_terms: 'net_15' | 'net_30' | 'net_60';
    }>(
      `SELECT bi.*, ba.owner_user_id, batv.payment_terms
         FROM business_invoices bi
         JOIN business_accounts ba ON ba.id = bi.business_account_id
         JOIN business_account_term_versions batv ON batv.id = bi.account_terms_version_id
        WHERE bi.id = $1 AND bi.business_account_id = $2
        FOR UPDATE OF bi, ba`,
      [params.invoiceId, accountId],
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw createAppError('The statement account changed concurrently. Reload and retry.', 409);
    if (invoice.control_state !== 'controlled' || invoice.status !== 'draft') {
      throw createAppError('Only a controlled draft statement can be finalized.', 409);
    }
    if (invoice.record_version !== params.expectedVersion) {
      throw createAppError('The statement changed after you opened it. Reload and retry.', 409);
    }
    if (!invoice.preparation_preview_id) {
      throw createAppError('The controlled draft has no preparation-batch evidence and cannot be finalized.', 409);
    }
    const state = await buildCandidateState(
      client,
      invoice.business_account_id,
      invoice.billing_period_start,
      invoice.billing_period_end,
      invoice.preparation_preview_id,
    );
    if (state.exceptions.length > 0) {
      throw createAppError('Statement readiness changed. Resolve the blocking exceptions before finalization.', 409);
    }
    const group = state.groups.find((candidate) => candidate.accountTermsVersionId === invoice.account_terms_version_id);
    if (!group || group.manifestHash !== invoice.manifest_hash
      || group.totalAmount !== Number(invoice.total_amount)) {
      throw createAppError('The booking manifest changed after draft preparation. Prepare a new draft.', 409);
    }
    const dueDays = dueDaysForTerms(invoice.payment_terms);
    const updatedResult = await client.query<ControlledInvoiceRow & { owner_user_id: string }>(
      `UPDATE business_invoices
          SET status = 'sent', finalized_at = NOW(), finalized_by = $1,
               finalization_reason = $2, record_version = record_version + 1,
              due_date = ((NOW() AT TIME ZONE 'Asia/Manila')::date + $5::integer),
              updated_at = NOW()
        WHERE id = $3 AND status = 'draft' AND control_state = 'controlled'
          AND record_version = $4
      RETURNING *, $6::uuid AS owner_user_id`,
      [params.actorId, reason, params.invoiceId, params.expectedVersion, dueDays, invoice.owner_user_id],
    );
    const updated = updatedResult.rows[0];
    if (!updated) throw createAppError('The statement changed concurrently. Reload and retry.', 409);
    const dueDate = updated.due_date;
    await writeAudit(client, params.actorId, 'business_invoice_finalized',
      invoice.id, reason, {
        businessAccountId: invoice.business_account_id,
        manifestHash: invoice.manifest_hash,
        beforeVersion: invoice.record_version,
        afterVersion: updated.record_version,
         totalAmount: invoice.total_amount,
         currency: invoice.currency,
         documentKind: 'commercial_statement',
         dueDate,
       });
    logger.info('Controlled business statement finalized', {
      invoiceId: invoice.id,
      businessAccountId: invoice.business_account_id,
      actorId: params.actorId,
    });
    return updated;
  });
}

async function loadInvoiceBalance(client: Queryable, invoiceId: string): Promise<InvoiceBalanceRow> {
  const result = await client.query<InvoiceBalanceRow>(
    `SELECT
       COALESCE(SUM(CASE
         WHEN bia.adjustment_type = 'debit' THEN bia.amount
         WHEN bia.adjustment_type IN ('credit', 'write_off') THEN -bia.amount
         ELSE 0 END), 0)::bigint AS adjustment_total,
       COALESCE((
         SELECT SUM(CASE WHEN bip.entry_type = 'payment' THEN bip.amount ELSE -bip.amount END)
           FROM business_invoice_payments bip WHERE bip.invoice_id = bi.id
       ), 0)::bigint AS payment_total,
       (bi.total_amount + COALESCE(SUM(CASE
         WHEN bia.adjustment_type = 'debit' THEN bia.amount
         WHEN bia.adjustment_type IN ('credit', 'write_off') THEN -bia.amount
         ELSE 0 END), 0))::bigint AS adjusted_total,
       (bi.total_amount + COALESCE(SUM(CASE
         WHEN bia.adjustment_type = 'debit' THEN bia.amount
         WHEN bia.adjustment_type IN ('credit', 'write_off') THEN -bia.amount
         ELSE 0 END), 0) - COALESCE((
           SELECT SUM(CASE WHEN bip.entry_type = 'payment' THEN bip.amount ELSE -bip.amount END)
             FROM business_invoice_payments bip WHERE bip.invoice_id = bi.id
       ), 0))::bigint AS balance_due
       FROM business_invoices bi
       LEFT JOIN business_invoice_adjustments bia ON bia.invoice_id = bi.id
      WHERE bi.id = $1
      GROUP BY bi.id, bi.total_amount`,
    [invoiceId],
  );
  const row = result.rows[0];
  if (!row) throw createAppError('Business statement not found.', 404);
  return {
    adjustment_total: Number(row.adjustment_total),
    payment_total: Number(row.payment_total),
    adjusted_total: Number(row.adjusted_total),
    balance_due: Number(row.balance_due),
  };
}

export async function recordInvoiceAdjustment(
  invoiceId: string,
  input: RecordBusinessInvoiceAdjustmentInput,
  actorId: string,
): Promise<{ invoice: ControlledInvoiceRow; balance: InvoiceBalanceRow }> {
  const reason = assertReason(input.reason);
  assertCentavos(input.amount, 'Adjustment amount');
  return db.transaction(async (client) => {
    const accountId = await loadInvoiceAccountId(client, invoiceId);
    await lockBusinessControls(client, accountId);
    const invoiceResult = await client.query<ControlledInvoiceRow>(
      `SELECT * FROM business_invoices
        WHERE id = $1 AND business_account_id = $2 FOR UPDATE`,
      [invoiceId, accountId],
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw createAppError('The statement account changed concurrently. Reload and retry.', 409);
    if (invoice.control_state !== 'controlled' || !['sent', 'overdue', 'paid'].includes(invoice.status)) {
      throw createAppError('Adjustments require a finalized controlled statement.', 409);
    }
    if (!invoice.finalized_at) {
      throw createAppError('The controlled statement has no finalization evidence.', 409);
    }
    if (invoice.record_version !== input.expectedVersion) {
      throw createAppError('The statement changed after you opened it. Reload and retry.', 409);
    }
    if (input.currency !== invoice.currency) {
      throw createAppError('Adjustment currency must match the statement currency.', 409);
    }
    const before = await loadInvoiceBalance(client, invoiceId);
    if (input.adjustmentType !== 'debit' && input.amount > before.adjusted_total) {
      throw createAppError('A credit or write-off cannot exceed the current adjusted statement total.', 409);
    }
    if (input.adjustmentType === 'write_off'
      && (before.balance_due <= 0 || input.amount > before.balance_due)) {
      throw createAppError('A write-off cannot exceed the current positive balance due.', 409);
    }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO business_invoice_adjustments
         (invoice_id, adjustment_type, amount, currency, reason,
          evidence_reference, recorded_by, invoice_record_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [invoiceId, input.adjustmentType, input.amount, input.currency, reason,
        input.evidenceReference, actorId, invoice.record_version],
    );
    const projectedBalance = before.balance_due + (
      input.adjustmentType === 'debit' ? input.amount : -input.amount
    );
    const updatedResult = await client.query<ControlledInvoiceRow>(
      `UPDATE business_invoices
          SET status = CASE
                WHEN $3::bigint <= 0 THEN 'paid'
                WHEN due_date < (NOW() AT TIME ZONE 'Asia/Manila')::date THEN 'overdue'
                ELSE 'sent'
              END,
              settlement_state = CASE
                WHEN $3::bigint < 0 THEN 'credit_due'
                WHEN $3::bigint = 0 THEN 'settled'
                ELSE 'open'
              END,
              paid_at = CASE WHEN $3::bigint > 0 THEN NULL ELSE paid_at END,
              payment_reference = CASE WHEN $3::bigint > 0 THEN NULL ELSE payment_reference END,
              record_version = record_version + 1,
              updated_at = NOW()
        WHERE id = $1 AND record_version = $2
      RETURNING *`,
      [invoiceId, input.expectedVersion, projectedBalance],
    );
    const updated = updatedResult.rows[0];
    if (!updated) throw createAppError('The statement changed concurrently. Reload and retry.', 409);
    const after = await loadInvoiceBalance(client, invoiceId);
    await writeAudit(client, actorId, 'business_invoice_adjustment_recorded',
      invoiceId, reason, {
        adjustmentId: inserted.rows[0]!.id,
        adjustmentType: input.adjustmentType,
        amount: input.amount,
        currency: input.currency,
        evidenceReference: input.evidenceReference,
        before,
        after,
        beforeVersion: invoice.record_version,
        afterVersion: updated.record_version,
      });
    return { invoice: updated, balance: after };
  });
}

export async function recordInvoicePayment(
  invoiceId: string,
  input: RecordBusinessInvoicePaymentInput,
  actorId: string,
): Promise<{ invoice: ControlledInvoiceRow; balance: InvoiceBalanceRow; paymentId: string }> {
  const reason = assertReason(input.reason);
  assertCentavos(input.amount, 'Payment amount');
  const effectiveAt = new Date(input.effectiveAt);
  if (!Number.isFinite(effectiveAt.getTime())) throw createAppError('Payment effective time is invalid.', 400);
  return db.transaction(async (client) => {
    const accountId = await loadInvoiceAccountId(client, invoiceId);
    await lockBusinessControls(client, accountId);
    const invoiceResult = await client.query<ControlledInvoiceRow>(
      `SELECT * FROM business_invoices
        WHERE id = $1 AND business_account_id = $2 FOR UPDATE`,
      [invoiceId, accountId],
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw createAppError('The statement account changed concurrently. Reload and retry.', 409);
    if (invoice.control_state !== 'controlled' || !['sent', 'overdue'].includes(invoice.status)) {
      throw createAppError('External payment evidence requires an unpaid finalized controlled statement.', 409);
    }
    if (!invoice.finalized_at) {
      throw createAppError('The controlled statement has no finalization evidence.', 409);
    }
    const clockResult = await client.query<{ now: Date }>('SELECT NOW() AS now');
    const databaseNow = new Date(clockResult.rows[0]!.now);
    if (effectiveAt.getTime() > databaseNow.getTime() + 5 * 60_000) {
      throw createAppError('Payment effective time cannot be in the future.', 400);
    }
    if (effectiveAt.getTime() < new Date(invoice.finalized_at).getTime()) {
      throw createAppError('Payment evidence cannot be effective before the statement was finalized.', 400);
    }
    if (invoice.record_version !== input.expectedVersion) {
      throw createAppError('The statement changed after you opened it. Reload and retry.', 409);
    }
    if (input.currency !== invoice.currency) {
      throw createAppError('Payment currency must match the statement currency.', 409);
    }
    const before = await loadInvoiceBalance(client, invoiceId);
    if (before.balance_due <= 0) throw createAppError('This statement has no positive balance due.', 409);
    if (input.amount > before.balance_due) {
      throw createAppError('Payment amount cannot exceed the current balance due.', 409);
    }
    await assertExternalReferenceAvailable(client, input.method, input.externalReference);
    const paymentResult = await client.query<{ id: string }>(
      `INSERT INTO business_invoice_payments
         (invoice_id, entry_type, amount, currency, method, effective_at,
          external_reference, evidence_reference, evidence_object_key,
          reason, recorded_by, invoice_record_version)
       VALUES ($1, 'payment', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [invoiceId, input.amount, input.currency, input.method, effectiveAt,
        input.externalReference, input.evidenceReference, input.evidenceObjectKey ?? null,
        reason, actorId, invoice.record_version],
    );
    const remaining = before.balance_due - input.amount;
    const updatedResult = await client.query<ControlledInvoiceRow>(
      `UPDATE business_invoices
          SET status = CASE WHEN $3::bigint = 0 THEN 'paid' ELSE status END,
              settlement_state = CASE WHEN $3::bigint = 0 THEN 'settled' ELSE 'open' END,
              paid_at = CASE WHEN $3::bigint = 0 THEN $4::timestamptz ELSE paid_at END,
              payment_reference = CASE WHEN $3::bigint = 0 THEN $5 ELSE payment_reference END,
              record_version = record_version + 1,
              updated_at = NOW()
        WHERE id = $1 AND record_version = $2
      RETURNING *`,
      [invoiceId, input.expectedVersion, remaining, effectiveAt, input.externalReference],
    );
    const updated = updatedResult.rows[0];
    if (!updated) throw createAppError('The statement changed concurrently. Reload and retry.', 409);
    const after = await loadInvoiceBalance(client, invoiceId);
    await writeAudit(client, actorId, 'business_invoice_payment_recorded',
      invoiceId, reason, {
        paymentId: paymentResult.rows[0]!.id,
        amount: input.amount,
        currency: input.currency,
        method: input.method,
        effectiveAt: input.effectiveAt,
        externalReference: input.externalReference,
        evidenceReference: input.evidenceReference,
        evidenceObjectKeyPresent: Boolean(input.evidenceObjectKey),
        classification: 'operator_recorded_external_evidence_not_gateway_verified',
        before,
        after,
        beforeVersion: invoice.record_version,
        afterVersion: updated.record_version,
      });
    logger.info('External business statement payment evidence recorded', {
      invoiceId,
      paymentId: paymentResult.rows[0]!.id,
      actorId,
      amount: input.amount,
      fullyPaid: remaining === 0,
    });
    return { invoice: updated, balance: after, paymentId: paymentResult.rows[0]!.id };
  });
}

export async function reverseInvoicePayment(
  invoiceId: string,
  paymentId: string,
  input: ReverseBusinessInvoicePaymentInput,
  actorId: string,
): Promise<{ invoice: ControlledInvoiceRow; balance: InvoiceBalanceRow; reversalId: string }> {
  const reason = assertReason(input.reason);
  assertCentavos(input.amount, 'Payment reversal amount');
  const effectiveAt = new Date(input.effectiveAt);
  if (!Number.isFinite(effectiveAt.getTime())) throw createAppError('Payment reversal effective time is invalid.', 400);

  return db.transaction(async (client) => {
    const accountId = await loadInvoiceAccountId(client, invoiceId);
    await lockBusinessControls(client, accountId);
    const invoiceResult = await client.query<ControlledInvoiceRow>(
      `SELECT * FROM business_invoices
        WHERE id = $1 AND business_account_id = $2 FOR UPDATE`,
      [invoiceId, accountId],
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw createAppError('The statement account changed concurrently. Reload and retry.', 409);
    if (invoice.control_state !== 'controlled' || !['sent', 'overdue', 'paid'].includes(invoice.status)) {
      throw createAppError('Payment reversal evidence requires a finalized controlled statement.', 409);
    }
    if (!invoice.finalized_at) {
      throw createAppError('The controlled statement has no finalization evidence.', 409);
    }
    const clockResult = await client.query<{ now: Date }>('SELECT NOW() AS now');
    const databaseNow = new Date(clockResult.rows[0]!.now);
    if (effectiveAt.getTime() > databaseNow.getTime() + 5 * 60_000) {
      throw createAppError('Payment reversal effective time cannot be in the future.', 400);
    }
    if (invoice.record_version !== input.expectedVersion) {
      throw createAppError('The statement changed after you opened it. Reload and retry.', 409);
    }

    const paymentResult = await client.query<PaymentEvidenceRow & { reversed_amount: number }>(
      `SELECT payment.*,
              COALESCE(SUM(reversal.amount), 0)::bigint AS reversed_amount
         FROM business_invoice_payments payment
        LEFT JOIN business_invoice_payments reversal
           ON reversal.reverses_payment_id = payment.id
          AND reversal.entry_type = 'reversal'
        WHERE payment.id = $1 AND payment.invoice_id = $2
        GROUP BY payment.id`,
      [paymentId, invoiceId],
    );
    const payment = paymentResult.rows[0];
    if (!payment || payment.entry_type !== 'payment') {
      throw createAppError('Original payment evidence was not found for this statement.', 404);
    }
    if (input.currency !== invoice.currency || input.currency !== payment.currency) {
      throw createAppError('Payment reversal currency must match the statement and original payment.', 409);
    }
    if (effectiveAt.getTime() < new Date(payment.effective_at).getTime()) {
      throw createAppError('Payment reversal cannot be effective before the original payment.', 400);
    }
    const availableToReverse = Number(payment.amount) - Number(payment.reversed_amount);
    if (!Number.isSafeInteger(availableToReverse) || availableToReverse <= 0) {
      throw createAppError('The original payment has already been fully reversed.', 409);
    }
    if (input.amount > availableToReverse) {
      throw createAppError('Payment reversal amount exceeds the unreversed original payment.', 409);
    }
    await assertExternalReferenceAvailable(client, payment.method, input.externalReference);
    const before = await loadInvoiceBalance(client, invoiceId);
    const reversalResult = await client.query<{ id: string }>(
      `INSERT INTO business_invoice_payments
         (invoice_id, entry_type, reverses_payment_id, amount, currency, method,
          effective_at, external_reference, evidence_reference, evidence_object_key,
          reason, recorded_by, invoice_record_version)
       VALUES ($1, 'reversal', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [invoiceId, paymentId, input.amount, input.currency, payment.method, effectiveAt,
        input.externalReference, input.evidenceReference, input.evidenceObjectKey ?? null,
        reason, actorId, invoice.record_version],
    );
    const after = await loadInvoiceBalance(client, invoiceId);
    const updatedResult = await client.query<ControlledInvoiceRow>(
      `UPDATE business_invoices
          SET status = CASE
                WHEN $3::bigint <= 0 THEN 'paid'
                WHEN due_date < (NOW() AT TIME ZONE 'Asia/Manila')::date THEN 'overdue'
                ELSE 'sent'
              END,
              settlement_state = CASE
                WHEN $3::bigint < 0 THEN 'credit_due'
                WHEN $3::bigint = 0 THEN 'settled'
                ELSE 'open'
              END,
              paid_at = CASE WHEN $3::bigint > 0 THEN NULL ELSE paid_at END,
              payment_reference = CASE WHEN $3::bigint > 0 THEN NULL ELSE payment_reference END,
              record_version = record_version + 1,
              updated_at = NOW()
        WHERE id = $1 AND record_version = $2
      RETURNING *`,
      [invoiceId, input.expectedVersion, after.balance_due],
    );
    const updated = updatedResult.rows[0];
    if (!updated) throw createAppError('The statement changed concurrently. Reload and retry.', 409);
    await writeAudit(client, actorId, 'business_invoice_payment_reversed',
      invoiceId, reason, {
        originalPaymentId: paymentId,
        reversalId: reversalResult.rows[0]!.id,
        amount: input.amount,
        currency: input.currency,
        method: payment.method,
        effectiveAt: input.effectiveAt,
        externalReference: input.externalReference,
        evidenceReference: input.evidenceReference,
        evidenceObjectKeyPresent: Boolean(input.evidenceObjectKey),
        classification: 'operator_recorded_external_reversal_or_refund_evidence_not_gateway_verified',
        before,
        after,
        beforeVersion: invoice.record_version,
        afterVersion: updated.record_version,
      });
    logger.info('External business payment reversal evidence recorded', {
      invoiceId,
      paymentId,
      reversalId: reversalResult.rows[0]!.id,
      actorId,
      amount: input.amount,
    });
    return { invoice: updated, balance: after, reversalId: reversalResult.rows[0]!.id };
  });
}

export async function voidInvoice(params: {
  invoiceId: string;
  expectedVersion: number;
  actorId: string;
  reason: string;
}): Promise<ControlledInvoiceRow & { owner_user_id: string }> {
  const reason = assertReason(params.reason);
  return db.transaction(async (client) => {
    const accountId = await loadInvoiceAccountId(client, params.invoiceId);
    await lockBusinessControls(client, accountId);
    const invoiceResult = await client.query<ControlledInvoiceRow & { owner_user_id: string }>(
      `SELECT bi.*, ba.owner_user_id
         FROM business_invoices bi
         JOIN business_accounts ba ON ba.id = bi.business_account_id
        WHERE bi.id = $1 AND bi.business_account_id = $2
        FOR UPDATE OF bi, ba`,
      [params.invoiceId, accountId],
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw createAppError('The statement account changed concurrently. Reload and retry.', 409);
    if (invoice.control_state !== 'controlled' || !['draft', 'sent', 'overdue'].includes(invoice.status)) {
      throw createAppError('Only an open controlled statement can be voided.', 409);
    }
    if (invoice.record_version !== params.expectedVersion) {
      throw createAppError('The statement changed after you opened it. Reload and retry.', 409);
    }
    const evidenceResult = await client.query<{ adjustment_count: string; payment_count: string }>(
      `SELECT
         (SELECT COUNT(*)::text FROM business_invoice_adjustments WHERE invoice_id = $1) AS adjustment_count,
         (SELECT COUNT(*)::text FROM business_invoice_payments WHERE invoice_id = $1) AS payment_count`,
      [params.invoiceId],
    );
    const evidence = evidenceResult.rows[0]!;
    if (Number(evidence.adjustment_count) > 0 || Number(evidence.payment_count) > 0) {
      throw createAppError(
        'A statement with adjustment or payment evidence cannot be voided. Correct it with append-only entries.',
        409,
      );
    }
    const updatedResult = await client.query<ControlledInvoiceRow & { owner_user_id: string }>(
      `UPDATE business_invoices
          SET status = 'void', settlement_state = 'void', record_version = record_version + 1,
              notes = CONCAT_WS(E'\n', NULLIF(notes, ''), 'Voided: ' || $1),
              updated_at = NOW()
        WHERE id = $2 AND record_version = $3
          AND control_state = 'controlled' AND status IN ('draft', 'sent', 'overdue')
      RETURNING *, $4::uuid AS owner_user_id`,
      [reason, params.invoiceId, params.expectedVersion, invoice.owner_user_id],
    );
    const updated = updatedResult.rows[0];
    if (!updated) throw createAppError('The statement changed concurrently. Reload and retry.', 409);
    await writeAudit(client, params.actorId, 'business_invoice_voided', params.invoiceId, reason, {
      businessAccountId: invoice.business_account_id,
      fromStatus: invoice.status,
      toStatus: 'void',
      manifestHash: invoice.manifest_hash,
      beforeVersion: invoice.record_version,
      afterVersion: updated.record_version,
    });
    return updated;
  });
}

export async function getInvoiceLedger(invoiceId: string): Promise<{
  adjustments: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
}> {
  const [adjustments, payments] = await Promise.all([
    db.query<Record<string, unknown>>(
      `SELECT * FROM business_invoice_adjustments
        WHERE invoice_id = $1 ORDER BY created_at ASC, id ASC`,
      [invoiceId],
    ),
    db.query<Record<string, unknown>>(
      `SELECT * FROM business_invoice_payments
        WHERE invoice_id = $1 ORDER BY effective_at ASC, created_at ASC, id ASC`,
      [invoiceId],
    ),
  ]);
  return {
    adjustments: adjustments.rows.map((row) => ({
      id: row.id,
      adjustmentType: row.adjustment_type,
      amount: Number(row.amount),
      currency: row.currency,
      reason: row.reason,
      evidenceReference: row.evidence_reference,
      recordedBy: row.recorded_by,
      invoiceRecordVersion: Number(row.invoice_record_version),
      createdAt: row.created_at,
    })),
    payments: payments.rows.map((row) => ({
      id: row.id,
      entryType: row.entry_type,
      reversesPaymentId: row.reverses_payment_id,
      amount: Number(row.amount),
      currency: row.currency,
      method: row.method,
      effectiveAt: row.effective_at,
      externalReference: row.external_reference,
      evidenceReference: row.evidence_reference,
      evidenceObjectKeyPresent: Boolean(row.evidence_object_key),
      reason: row.reason,
      recordedBy: row.recorded_by,
      invoiceRecordVersion: Number(row.invoice_record_version),
      createdAt: row.created_at,
      classification: row.entry_type === 'payment'
        ? 'operator_recorded_external_evidence_not_gateway_verified'
        : 'operator_recorded_external_reversal_or_refund_evidence_not_gateway_verified',
    })),
  };
}

export async function getInvoiceCustomerLedger(invoiceId: string): Promise<{
  adjustments: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
}> {
  const [adjustments, payments] = await Promise.all([
    db.query<Record<string, unknown>>(
      `SELECT id, adjustment_type, amount, currency, created_at
         FROM business_invoice_adjustments
        WHERE invoice_id = $1 ORDER BY created_at ASC, id ASC`,
      [invoiceId],
    ),
    db.query<Record<string, unknown>>(
      `SELECT id, entry_type, reverses_payment_id, amount, currency, method,
              effective_at, external_reference, created_at
         FROM business_invoice_payments
        WHERE invoice_id = $1 ORDER BY effective_at ASC, created_at ASC, id ASC`,
      [invoiceId],
    ),
  ]);
  return {
    adjustments: adjustments.rows.map((row) => ({
      id: row.id,
      adjustmentType: row.adjustment_type,
      amount: Number(row.amount),
      currency: row.currency,
      createdAt: row.created_at,
    })),
    payments: payments.rows.map((row) => ({
      id: row.id,
      entryType: row.entry_type,
      reversesPaymentId: row.reverses_payment_id,
      amount: Number(row.amount),
      currency: row.currency,
      method: row.method,
      effectiveAt: row.effective_at,
      externalReference: row.external_reference,
      createdAt: row.created_at,
    })),
  };
}

export async function getInvoiceBalance(invoiceId: string): Promise<Record<string, number>> {
  const balance = await loadInvoiceBalance(db, invoiceId);
  return {
    adjustmentTotal: balance.adjustment_total,
    paymentTotal: balance.payment_total,
    adjustedTotal: balance.adjusted_total,
    balanceDue: balance.balance_due,
  };
}

export async function assertBusinessCreditAvailableInTransaction(
  client: Queryable,
  params: {
    accountId: string;
    contractId: string;
    termsVersionId: string;
    customerId: string;
    scheduledAt: string | Date;
    newBookingAmount: number;
  },
): Promise<{ creditLimit: number; currentExposure: number; remainingAfterBooking: number }> {
  assertCentavos(params.newBookingAmount, 'Business booking amount');
  const accountResult = await client.query<{
    status: string;
    record_version: number;
    current_terms_id: string | null;
    monthly_credit_limit: number | null;
  }>(
    `SELECT ba.status, ba.record_version,
            current_terms.id AS current_terms_id,
            current_terms.monthly_credit_limit
       FROM business_accounts ba
       JOIN business_contracts bc
         ON bc.business_account_id = ba.id AND bc.id = $2
        AND bc.status = 'active' AND bc.published_at IS NOT NULL
        AND bc.provider_id IS NULL
        AND bc.start_date <= ($4::timestamptz AT TIME ZONE 'Asia/Manila')::date
        AND (bc.end_date IS NULL OR bc.end_date >= ($4::timestamptz AT TIME ZONE 'Asia/Manila')::date)
       JOIN business_members bm
         ON bm.business_account_id = ba.id AND bm.user_id = $3
        AND bm.deleted_at IS NULL AND bm.can_book = TRUE
       LEFT JOIN LATERAL (
         SELECT id, monthly_credit_limit
           FROM business_account_term_versions
          WHERE business_account_id = ba.id AND effective_from <= NOW()
          ORDER BY effective_from DESC, version DESC
          LIMIT 1
       ) current_terms ON TRUE
      WHERE ba.id = $1
      FOR UPDATE OF ba, bc, bm`,
    [params.accountId, params.contractId, params.customerId, params.scheduledAt],
  );
  const account = accountResult.rows[0];
  if (!account || account.status !== 'active') {
    throw createAppError(
      'The company account, contract, or booking permission changed. Reload the company booking and retry.',
      409,
    );
  }
  if (!account.current_terms_id || account.current_terms_id !== params.termsVersionId) {
    throw createAppError('Business terms changed while booking. Reload the company pricing and retry.', 409);
  }
  const creditLimit = Number(account.monthly_credit_limit ?? 0);
  if (!Number.isSafeInteger(creditLimit) || creditLimit <= 0) {
    throw createAppError('This business account has no approved billing credit.', 409);
  }
  const exposureResult = await client.query<{ exposure: number }>(
    `WITH adjustment_totals AS (
       SELECT invoice_id,
              SUM(CASE WHEN adjustment_type = 'debit' THEN amount ELSE -amount END)::bigint AS amount
         FROM business_invoice_adjustments GROUP BY invoice_id
     ), payment_totals AS (
       SELECT invoice_id,
              SUM(CASE WHEN entry_type = 'payment' THEN amount ELSE -amount END)::bigint AS amount
         FROM business_invoice_payments GROUP BY invoice_id
     )
     SELECT (
       COALESCE((
         SELECT SUM(b.total_amount)
           FROM bookings b
          WHERE b.business_account_id = $1
            AND b.status NOT IN ('cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin')
            AND NOT EXISTS (
              SELECT 1 FROM business_invoice_items bii
              JOIN business_invoices bi ON bi.id = bii.invoice_id
              WHERE bii.booking_id = b.id
                AND bi.control_state = 'controlled'
                AND bi.status IN ('sent', 'overdue', 'paid')
            )
       ), 0)
       + COALESCE((
         SELECT SUM(GREATEST(
           bi.total_amount + COALESCE(adj.amount, 0) - COALESCE(pay.amount, 0), 0
         ))
           FROM business_invoices bi
           LEFT JOIN adjustment_totals adj ON adj.invoice_id = bi.id
           LEFT JOIN payment_totals pay ON pay.invoice_id = bi.id
          WHERE bi.business_account_id = $1
            AND bi.control_state = 'controlled'
            AND bi.status IN ('sent', 'overdue', 'paid')
       ), 0)
     ) AS exposure`,
    [params.accountId],
  );
  const currentExposure = Number(exposureResult.rows[0]?.exposure ?? 0);
  if (!Number.isSafeInteger(currentExposure) || currentExposure < 0) {
    throw createAppError('Business credit exposure could not be reconciled safely.', 409);
  }
  const projectedExposure = currentExposure + params.newBookingAmount;
  if (!Number.isSafeInteger(projectedExposure)) {
    throw createAppError('Projected business credit exposure exceeds exact centavo arithmetic limits.', 409);
  }
  if (projectedExposure > creditLimit) {
    throw createAppError(
      `This booking exceeds the approved business credit. Available: ${creditLimit - currentExposure} centavos.`,
      409,
    );
  }
  return {
    creditLimit,
    currentExposure,
    remainingAfterBooking: creditLimit - projectedExposure,
  };
}
