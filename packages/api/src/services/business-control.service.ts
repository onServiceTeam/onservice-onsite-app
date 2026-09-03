import { createHash } from 'crypto';
import type { QueryResult, QueryResultRow } from 'pg';
import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import type { PreviewBusinessTermsInput } from '../validators/admin-business.validators';
import type { BusinessContractRow } from './business.service';

type Queryable = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<T>>;
};

type AccountLifecycleAction = 'approve' | 'suspend';
type ContractLifecycleAction = 'publish' | 'cancel';

interface AccountControlRow {
  id: string;
  company_name: string;
  owner_user_id: string;
  status: string;
  payment_terms: string;
  volume_discount_rate: string;
  monthly_credit_limit: number;
  record_version: number;
  updated_at: Date;
}

interface AccountImpactRow {
  published_contract_count: string;
  open_booking_count: string;
  future_booking_count: string;
  controlled_statement_count: string;
  open_statement_count: string;
}

interface LifecyclePreviewRow {
  id: string;
  business_account_id: string;
  action: AccountLifecycleAction;
  created_by: string;
  account_record_version: number;
  impact_summary: Record<string, unknown>;
  state_fingerprint: string;
  expires_at: Date;
  created_at: Date;
}

interface TermsVersionRow {
  id: string;
  business_account_id: string;
  version: number;
  payment_terms: 'net_15' | 'net_30' | 'net_60';
  volume_discount_basis_points: number;
  monthly_credit_limit: number;
  currency: 'PHP';
  effective_from: Date;
  reason: string;
  created_by: string;
  approved_by: string;
  created_at: Date;
}

interface TermsPreviewRow {
  id: string;
  business_account_id: string;
  created_by: string;
  account_record_version: number;
  payment_terms: 'net_15' | 'net_30' | 'net_60';
  volume_discount_basis_points: number;
  monthly_credit_limit: number;
  effective_from: Date;
  impact_summary: Record<string, unknown>;
  state_fingerprint: string;
  expires_at: Date;
  created_at: Date;
}

interface ContractControlRow extends BusinessContractRow {
  record_version: number;
  published_at: Date | null;
}

interface ContractPreviewRow {
  id: string;
  business_account_id: string;
  contract_id: string;
  action: ContractLifecycleAction;
  created_by: string;
  account_record_version: number;
  contract_record_version: number;
  impact_summary: Record<string, unknown>;
  state_fingerprint: string;
  expires_at: Date;
  created_at: Date;
}

export interface BusinessControlPreview {
  id: string;
  action: string;
  impact: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function assertReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length < 10 || trimmed.length > 2000) {
    throw createAppError('Reason must be between 10 and 2000 characters.', 400);
  }
  return trimmed;
}

async function lockBusinessControls(client: Queryable, accountId: string): Promise<void> {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext('onservice:b2b:' || $1::text))`,
    [accountId],
  );
}

async function writeAudit(
  client: Queryable,
  actorId: string,
  actionType: string,
  targetType: string,
  targetId: string,
  reason: string,
  details: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO admin_actions
       (admin_id, action_type, target_type, target_id, details, reason, full_notes)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $6)`,
    [actorId, actionType, targetType, targetId, JSON.stringify(details), reason],
  );
}

async function loadAccount(
  client: Queryable,
  accountId: string,
  forUpdate = false,
): Promise<AccountControlRow> {
  const result = await client.query<AccountControlRow>(
    `SELECT id, company_name, owner_user_id, status, payment_terms,
            volume_discount_rate, monthly_credit_limit, record_version, updated_at
       FROM business_accounts
      WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [accountId],
  );
  const account = result.rows[0];
  if (!account) throw createAppError('Business account not found.', 404);
  return account;
}

async function loadAccountImpact(client: Queryable, accountId: string): Promise<Record<string, number>> {
  const result = await client.query<AccountImpactRow>(
    `SELECT
       (SELECT COUNT(*)::text FROM business_contracts
         WHERE business_account_id = $1 AND status = 'active' AND published_at IS NOT NULL)
         AS published_contract_count,
       (SELECT COUNT(*)::text FROM bookings
         WHERE business_account_id = $1
           AND status NOT IN (
             'paid_out', 'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin'
           ))
         AS open_booking_count,
       (SELECT COUNT(*)::text FROM bookings
         WHERE business_account_id = $1
           AND scheduled_at > NOW()
           AND status NOT IN (
             'paid_out', 'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin'
           ))
         AS future_booking_count,
       (SELECT COUNT(*)::text FROM business_invoices
         WHERE business_account_id = $1 AND control_state = 'controlled')
         AS controlled_statement_count,
       (SELECT COUNT(*)::text FROM business_invoices
         WHERE business_account_id = $1 AND status IN ('draft', 'sent', 'overdue'))
         AS open_statement_count`,
    [accountId],
  );
  const row = result.rows[0]!;
  return {
    publishedContractCount: Number(row.published_contract_count),
    openBookingCount: Number(row.open_booking_count),
    futureBookingCount: Number(row.future_booking_count),
    controlledStatementCount: Number(row.controlled_statement_count),
    openStatementCount: Number(row.open_statement_count),
  };
}

function lifecycleState(account: AccountControlRow, impact: Record<string, number>): unknown {
  return {
    account: {
      id: account.id,
      status: account.status,
      recordVersion: account.record_version,
      updatedAt: account.updated_at,
    },
    impact,
  };
}

export async function previewAccountLifecycle(
  accountId: string,
  action: AccountLifecycleAction,
  actorId: string,
): Promise<BusinessControlPreview> {
  return db.transaction(async (client) => {
    await lockBusinessControls(client, accountId);
    const account = await loadAccount(client, accountId, true);
    if (action === 'approve' && account.status !== 'pending') {
      throw createAppError('Only a pending business account can be approved.', 409);
    }
    if (action === 'suspend' && account.status !== 'active') {
      throw createAppError('Only an active business account can be suspended.', 409);
    }
    const impact = await loadAccountImpact(client, accountId);
    const stateFingerprint = fingerprint(lifecycleState(account, impact));
    const result = await client.query<LifecyclePreviewRow>(
      `INSERT INTO business_account_lifecycle_previews
         (business_account_id, action, created_by, account_record_version,
          impact_summary, state_fingerprint)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING *`,
      [accountId, action, actorId, account.record_version, JSON.stringify(impact), stateFingerprint],
    );
    const preview = result.rows[0]!;
    return { id: preview.id, action, impact, expiresAt: preview.expires_at, createdAt: preview.created_at };
  });
}

export async function applyAccountLifecycleDecision(params: {
  accountId: string;
  action: AccountLifecycleAction;
  previewId: string;
  actorId: string;
  reason: string;
}): Promise<AccountControlRow> {
  const reason = assertReason(params.reason);
  return db.transaction(async (client) => {
    await lockBusinessControls(client, params.accountId);
    const account = await loadAccount(client, params.accountId, true);
    const previewResult = await client.query<LifecyclePreviewRow>(
      `SELECT * FROM business_account_lifecycle_previews
        WHERE id = $1 AND business_account_id = $2 AND action = $3 AND created_by = $4
          AND expires_at > NOW()
        FOR UPDATE`,
      [params.previewId, params.accountId, params.action, params.actorId],
    );
    const preview = previewResult.rows[0];
    if (!preview) throw createAppError('A current, unexpired lifecycle preview by this operator is required.', 409);
    const expectedStatus = params.action === 'approve' ? 'pending' : 'active';
    if (account.status !== expectedStatus || account.record_version !== preview.account_record_version) {
      throw createAppError('The business account changed after preview. Reload and preview again.', 409);
    }
    const impact = await loadAccountImpact(client, params.accountId);
    if (fingerprint(lifecycleState(account, impact)) !== preview.state_fingerprint) {
      throw createAppError('Business-account impact changed after preview. Run the preview again.', 409);
    }

    const nextStatus = params.action === 'approve' ? 'active' : 'suspended';
    const result = await client.query<AccountControlRow>(
      params.action === 'approve'
        ? `UPDATE business_accounts
              SET status = 'active', approved_at = NOW(), approved_by = $1,
                  approval_reason = $2, record_version = record_version + 1,
                  updated_at = NOW()
            WHERE id = $3 AND status = 'pending' AND record_version = $4
          RETURNING id, company_name, owner_user_id, status, payment_terms,
                    volume_discount_rate, monthly_credit_limit, record_version, updated_at`
        : `UPDATE business_accounts
              SET status = 'suspended', suspended_at = NOW(), suspended_by = $1,
                  suspension_reason = $2, record_version = record_version + 1,
                  updated_at = NOW()
            WHERE id = $3 AND status = 'active' AND record_version = $4
          RETURNING id, company_name, owner_user_id, status, payment_terms,
                    volume_discount_rate, monthly_credit_limit, record_version, updated_at`,
      [params.actorId, reason, params.accountId, preview.account_record_version],
    );
    const updated = result.rows[0];
    if (!updated) throw createAppError('The business account changed concurrently. Reload and retry.', 409);
    await writeAudit(
      client,
      params.actorId,
      params.action === 'approve' ? 'business_account_approved' : 'business_account_suspended',
      'business_account',
      params.accountId,
      reason,
      { previewId: preview.id, impact, fromStatus: expectedStatus, toStatus: nextStatus,
        beforeVersion: account.record_version, afterVersion: updated.record_version },
    );
    logger.info(`Business account ${params.action} decision applied`, {
      businessAccountId: params.accountId,
      actorId: params.actorId,
      previewId: params.previewId,
    });
    return updated;
  });
}

async function loadCurrentTerms(client: Queryable, accountId: string): Promise<TermsVersionRow | null> {
  const result = await client.query<TermsVersionRow>(
    `SELECT * FROM business_account_term_versions
      WHERE business_account_id = $1 AND effective_from <= NOW()
      ORDER BY effective_from DESC, version DESC
      LIMIT 1`,
    [accountId],
  );
  return result.rows[0] ?? null;
}

export async function getCurrentBusinessTerms(accountId: string): Promise<Record<string, unknown> | null> {
  const terms = await loadCurrentTerms(db, accountId);
  return terms ? formatBusinessTerms(terms) : null;
}

export async function getCurrentBusinessTermsForMember(
  accountId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const membership = await db.query<{ role: string; can_view_invoices: boolean }>(
    `SELECT role, can_view_invoices FROM business_members
      WHERE business_account_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [accountId, userId],
  );
  if (membership.rows.length === 0) throw createAppError('Access denied.', 403);
  const viewer = membership.rows[0]!;
  if (viewer.role === 'member' && !viewer.can_view_invoices) {
    throw createAppError('You do not have permission to view company financial terms.', 403);
  }
  const terms = await loadCurrentTerms(db, accountId);
  if (!terms) return null;
  return {
    id: terms.id,
    version: terms.version,
    paymentTerms: terms.payment_terms,
    volumeDiscountRate: Number(terms.volume_discount_basis_points) / 100,
    monthlyCreditLimit: Number(terms.monthly_credit_limit),
    currency: terms.currency,
    effectiveFrom: terms.effective_from,
  };
}

function normalizeDiscountBasisPoints(rate: number): number {
  const basisPoints = Math.round(rate * 100);
  if (Math.abs((basisPoints / 100) - rate) > 0.000001) {
    throw createAppError('Volume discount supports at most two decimal places.', 400);
  }
  return basisPoints;
}

function termsState(
  account: AccountControlRow,
  current: TermsVersionRow | null,
  impact: Record<string, number>,
): unknown {
  return {
    account: { id: account.id, status: account.status, recordVersion: account.record_version, updatedAt: account.updated_at },
    currentTerms: current
      ? { id: current.id, version: current.version, effectiveFrom: current.effective_from }
      : null,
    impact,
  };
}

export async function previewBusinessTerms(
  accountId: string,
  input: PreviewBusinessTermsInput,
  actorId: string,
): Promise<BusinessControlPreview & { proposedTerms: Record<string, unknown> }> {
  const basisPoints = normalizeDiscountBasisPoints(input.volumeDiscountRate);

  return db.transaction(async (client) => {
    await lockBusinessControls(client, accountId);
    const account = await loadAccount(client, accountId, true);
    if (account.status !== 'active') throw createAppError('Business terms can be published only for an active account.', 409);
    if (account.record_version !== input.expectedVersion) {
      throw createAppError('The business account changed. Reload before previewing terms.', 409);
    }
    const current = await loadCurrentTerms(client, accountId);
    if (current
      && current.payment_terms === input.paymentTerms
      && Number(current.volume_discount_basis_points) === basisPoints
      && Number(current.monthly_credit_limit) === input.monthlyCreditLimit) {
      throw createAppError('The proposed business terms do not change the current agreement.', 409);
    }
    const impact = await loadAccountImpact(client, accountId);
    const stateFingerprint = fingerprint(termsState(account, current, impact));
    const inserted = await client.query<TermsPreviewRow>(
      `INSERT INTO business_account_term_previews
       (business_account_id, created_by, account_record_version, payment_terms,
          volume_discount_basis_points, monthly_credit_limit, effective_from,
          impact_summary, state_fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7::jsonb, $8)
       RETURNING *`,
      [accountId, actorId, account.record_version, input.paymentTerms, basisPoints,
        input.monthlyCreditLimit, JSON.stringify(impact), stateFingerprint],
    );
    const preview = inserted.rows[0]!;
    return {
      id: preview.id,
      action: 'publish_terms',
      impact,
      proposedTerms: {
        paymentTerms: preview.payment_terms,
        volumeDiscountRate: preview.volume_discount_basis_points / 100,
        monthlyCreditLimit: Number(preview.monthly_credit_limit),
        currency: 'PHP',
        effectiveFrom: preview.effective_from,
      },
      expiresAt: preview.expires_at,
      createdAt: preview.created_at,
    };
  });
}

export async function publishBusinessTerms(params: {
  accountId: string;
  previewId: string;
  actorId: string;
  reason: string;
}): Promise<TermsVersionRow> {
  const reason = assertReason(params.reason);
  return db.transaction(async (client) => {
    await lockBusinessControls(client, params.accountId);
    const account = await loadAccount(client, params.accountId, true);
    if (account.status !== 'active') throw createAppError('Business terms can be published only for an active account.', 409);
    const previewResult = await client.query<TermsPreviewRow>(
      `SELECT * FROM business_account_term_previews
        WHERE id = $1 AND business_account_id = $2 AND created_by = $3
          AND expires_at > NOW()
        FOR UPDATE`,
      [params.previewId, params.accountId, params.actorId],
    );
    const preview = previewResult.rows[0];
    if (!preview) throw createAppError('A current, unexpired terms preview by this operator is required.', 409);
    if (account.record_version !== preview.account_record_version) {
      throw createAppError('The business account changed after preview. Reload and preview again.', 409);
    }
    const current = await loadCurrentTerms(client, params.accountId);
    const impact = await loadAccountImpact(client, params.accountId);
    if (fingerprint(termsState(account, current, impact)) !== preview.state_fingerprint) {
      throw createAppError('Business-account impact changed after preview. Run the preview again.', 409);
    }
    const nextVersionResult = await client.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
         FROM business_account_term_versions WHERE business_account_id = $1`,
      [params.accountId],
    );
    const nextVersion = Number(nextVersionResult.rows[0]!.next_version);
    const inserted = await client.query<TermsVersionRow>(
      `INSERT INTO business_account_term_versions
         (business_account_id, version, payment_terms, volume_discount_basis_points,
          monthly_credit_limit, currency, effective_from, reason, created_by, approved_by)
       VALUES ($1, $2, $3, $4, $5, 'PHP', $6, $7, $8, $8)
       RETURNING *`,
      [params.accountId, nextVersion, preview.payment_terms, preview.volume_discount_basis_points,
        preview.monthly_credit_limit, preview.effective_from, reason, params.actorId],
    );
    const terms = inserted.rows[0]!;
    const updated = await client.query<{ record_version: number }>(
      `UPDATE business_accounts
          SET payment_terms = $2,
              volume_discount_rate = $3::numeric / 100,
              monthly_credit_limit = $4,
              record_version = record_version + 1,
              updated_at = NOW()
        WHERE id = $1 AND record_version = $5
      RETURNING record_version`,
      [params.accountId, terms.payment_terms, terms.volume_discount_basis_points,
        terms.monthly_credit_limit, preview.account_record_version],
    );
    if (!updated.rows[0]) throw createAppError('The business account changed concurrently. Reload and retry.', 409);
    await writeAudit(client, params.actorId, 'business_terms_published', 'business_account',
      params.accountId, reason, {
        previewId: preview.id,
        previousTermsVersionId: current?.id ?? null,
        termsVersionId: terms.id,
        version: terms.version,
        effectiveFrom: terms.effective_from,
        impact,
        afterAccountVersion: updated.rows[0].record_version,
      });
    logger.info('Business account terms published', {
      businessAccountId: params.accountId,
      termsVersionId: terms.id,
      actorId: params.actorId,
    });
    return terms;
  });
}

async function loadContract(
  client: Queryable,
  accountId: string,
  contractId: string,
  forUpdate = false,
): Promise<ContractControlRow> {
  const result = await client.query<ContractControlRow>(
    `SELECT * FROM business_contracts
      WHERE id = $1 AND business_account_id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
    [contractId, accountId],
  );
  const contract = result.rows[0];
  if (!contract) throw createAppError('Business contract not found for this account.', 404);
  return contract;
}

async function loadContractImpact(
  client: Queryable,
  accountId: string,
  contract: ContractControlRow,
  action: ContractLifecycleAction,
): Promise<Record<string, number>> {
  if (action === 'publish') {
    const overlap = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM business_contracts existing
        WHERE existing.business_account_id = $1
          AND existing.id <> $2
          AND existing.status = 'active'
          AND existing.published_at IS NOT NULL
          AND existing.category_id = $3
          AND existing.subcategory_id IS NOT DISTINCT FROM $4::uuid
          AND existing.provider_id IS NOT DISTINCT FROM $5::uuid
          AND daterange(existing.start_date, COALESCE(existing.end_date, 'infinity'::date), '[]')
              && daterange($6::date, COALESCE($7::date, 'infinity'::date), '[]')`,
      [accountId, contract.id, contract.category_id, contract.subcategory_id,
        contract.provider_id, contract.start_date, contract.end_date],
    );
    return { overlappingPublishedContractCount: Number(overlap.rows[0]?.count ?? 0) };
  }
  const result = await client.query<{ open_count: string; future_count: string }>(
    `SELECT
       COUNT(*) FILTER (
         WHERE status NOT IN (
           'paid_out', 'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin'
         )
       )::text AS open_count,
       COUNT(*) FILTER (
         WHERE scheduled_at > NOW()
           AND status NOT IN (
             'paid_out', 'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin'
           )
       )::text AS future_count
       FROM bookings WHERE business_account_id = $1 AND contract_id = $2`,
    [accountId, contract.id],
  );
  return {
    linkedOpenBookingCount: Number(result.rows[0]?.open_count ?? 0),
    linkedFutureBookingCount: Number(result.rows[0]?.future_count ?? 0),
  };
}

function contractState(
  account: AccountControlRow,
  contract: ContractControlRow,
  currentTerms: TermsVersionRow | null,
  impact: Record<string, number>,
): unknown {
  return {
    account: { id: account.id, status: account.status, recordVersion: account.record_version },
    contract: {
      id: contract.id,
      status: contract.status,
      recordVersion: contract.record_version,
      categoryId: contract.category_id,
      subcategoryId: contract.subcategory_id,
      providerId: contract.provider_id,
      agreedRate: Number(contract.agreed_rate),
      discountPercentage: Number(contract.discount_percentage),
      startDate: contract.start_date,
      endDate: contract.end_date,
      updatedAt: contract.updated_at,
    },
    currentTerms: currentTerms ? { id: currentTerms.id, version: currentTerms.version } : null,
    impact,
  };
}

export async function previewContractLifecycle(
  accountId: string,
  contractId: string,
  action: ContractLifecycleAction,
  actorId: string,
): Promise<BusinessControlPreview> {
  return db.transaction(async (client) => {
    await lockBusinessControls(client, accountId);
    const account = await loadAccount(client, accountId, true);
    const contract = await loadContract(client, accountId, contractId, true);
    const currentTerms = await loadCurrentTerms(client, accountId);
    if (action === 'publish') {
      if (account.status !== 'active') throw createAppError('The account must be active before publishing a contract.', 409);
      if (!currentTerms) throw createAppError('Publish approved business terms before publishing a contract.', 409);
      if (contract.status !== 'draft' || contract.published_at !== null) {
        throw createAppError('Only an unpublished draft contract can be published.', 409);
      }
      if (!Number.isSafeInteger(Number(contract.agreed_rate)) || Number(contract.agreed_rate) <= 0) {
        throw createAppError('Contract agreed rate must be a positive integer amount in centavos.', 409);
      }
      if (Number(contract.discount_percentage) !== 0) {
        throw createAppError(
          'Contract-level discount publication is held until its relationship to the account volume discount is approved. Set the draft contract discount to 0 and use published account terms only.',
          409,
        );
      }
      if (contract.provider_id !== null) {
        throw createAppError(
          'Provider-specific contract publication is held until provider assignment, funding, and payable terms are approved under E56. Use a provider-pool draft only for the current controlled foundation.',
          409,
        );
      }
      if (contract.end_date && contract.end_date < contract.start_date) {
        throw createAppError('Contract end date cannot be before its start date.', 409);
      }
    } else if (contract.status !== 'active' || contract.published_at === null) {
      throw createAppError('Only a published active contract can be cancelled.', 409);
    }
    const impact = await loadContractImpact(client, accountId, contract, action);
    if (action === 'publish' && (impact.overlappingPublishedContractCount ?? 0) > 0) {
      throw createAppError('An overlapping published contract already covers this exact scope and date range.', 409);
    }
    const stateFingerprint = fingerprint(contractState(account, contract, currentTerms, impact));
    const result = await client.query<ContractPreviewRow>(
      `INSERT INTO business_contract_publication_previews
         (business_account_id, contract_id, action, created_by,
          account_record_version, contract_record_version, impact_summary, state_fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       RETURNING *`,
      [accountId, contractId, action, actorId, account.record_version,
        contract.record_version, JSON.stringify(impact), stateFingerprint],
    );
    const preview = result.rows[0]!;
    return { id: preview.id, action, impact, expiresAt: preview.expires_at, createdAt: preview.created_at };
  });
}

export async function applyContractLifecycleDecision(params: {
  accountId: string;
  contractId: string;
  action: ContractLifecycleAction;
  previewId: string;
  actorId: string;
  reason: string;
}): Promise<ContractControlRow> {
  const reason = assertReason(params.reason);
  return db.transaction(async (client) => {
    await lockBusinessControls(client, params.accountId);
    const account = await loadAccount(client, params.accountId, true);
    const contract = await loadContract(client, params.accountId, params.contractId, true);
    const currentTerms = await loadCurrentTerms(client, params.accountId);
    const previewResult = await client.query<ContractPreviewRow>(
      `SELECT * FROM business_contract_publication_previews
        WHERE id = $1 AND business_account_id = $2 AND contract_id = $3
          AND action = $4 AND created_by = $5
          AND expires_at > NOW()
        FOR UPDATE`,
      [params.previewId, params.accountId, params.contractId, params.action, params.actorId],
    );
    const preview = previewResult.rows[0];
    if (!preview) throw createAppError('A current, unexpired contract preview by this operator is required.', 409);
    if (account.record_version !== preview.account_record_version
      || contract.record_version !== preview.contract_record_version) {
      throw createAppError('The account or contract changed after preview. Reload and preview again.', 409);
    }
    const expectedStatus = params.action === 'publish' ? 'draft' : 'active';
    if (contract.status !== expectedStatus) throw createAppError('The contract lifecycle changed after preview.', 409);
    const impact = await loadContractImpact(client, params.accountId, contract, params.action);
    if (fingerprint(contractState(account, contract, currentTerms, impact)) !== preview.state_fingerprint) {
      throw createAppError('Contract impact changed after preview. Run the preview again.', 409);
    }
    if (params.action === 'publish' && (!currentTerms || account.status !== 'active')) {
      throw createAppError('The active account and approved terms are required for publication.', 409);
    }
    if (params.action === 'publish' && Number(contract.discount_percentage) !== 0) {
      throw createAppError(
        'Contract-level discount publication remains held. Reload the contract and use a zero contract discount.',
        409,
      );
    }
    if (params.action === 'publish' && contract.provider_id !== null) {
      throw createAppError(
        'Provider-specific contract publication remains held under E56. Reload the contract and keep it as a draft.',
        409,
      );
    }
    const result = await client.query<ContractControlRow>(
      params.action === 'publish'
        ? `UPDATE business_contracts
              SET status = 'active', published_at = NOW(), published_by = $1,
                  publish_reason = $2, record_version = record_version + 1,
                  updated_at = NOW()
            WHERE id = $3 AND business_account_id = $4
              AND status = 'draft' AND published_at IS NULL AND record_version = $5
          RETURNING *`
        : `UPDATE business_contracts
              SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $1,
                  cancellation_reason = $2, record_version = record_version + 1,
                  updated_at = NOW()
            WHERE id = $3 AND business_account_id = $4
              AND status = 'active' AND published_at IS NOT NULL AND record_version = $5
          RETURNING *`,
      [params.actorId, reason, params.contractId, params.accountId, preview.contract_record_version],
    );
    const updated = result.rows[0];
    if (!updated) throw createAppError('The contract changed concurrently. Reload and retry.', 409);
    const toStatus = params.action === 'publish' ? 'active' : 'cancelled';
    await client.query(
      `INSERT INTO business_contract_events
         (business_account_id, contract_id, event_type, from_status, to_status,
          contract_record_version, reason, actor_id, snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [params.accountId, params.contractId,
        params.action === 'publish' ? 'published' : 'cancelled',
        expectedStatus, toStatus, updated.record_version, reason, params.actorId,
        JSON.stringify(updated)],
    );
    await writeAudit(client, params.actorId,
      params.action === 'publish' ? 'business_contract_published' : 'business_contract_cancelled',
      'business_contract', params.contractId, reason, {
        previewId: preview.id,
        businessAccountId: params.accountId,
        impact,
        fromStatus: expectedStatus,
        toStatus,
        beforeVersion: contract.record_version,
        afterVersion: updated.record_version,
      });
    logger.info(`Business contract ${params.action} decision applied`, {
      businessAccountId: params.accountId,
      contractId: params.contractId,
      actorId: params.actorId,
    });
    return updated;
  });
}

export function formatBusinessTerms(terms: TermsVersionRow): Record<string, unknown> {
  return {
    id: terms.id,
    businessAccountId: terms.business_account_id,
    version: terms.version,
    paymentTerms: terms.payment_terms,
    volumeDiscountRate: Number(terms.volume_discount_basis_points) / 100,
    monthlyCreditLimit: Number(terms.monthly_credit_limit),
    currency: terms.currency,
    effectiveFrom: terms.effective_from,
    reason: terms.reason,
    createdBy: terms.created_by,
    approvedBy: terms.approved_by,
    createdAt: terms.created_at,
  };
}
